import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.78.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  console.log("Forgot password function called");

  try {
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      console.error("RESEND_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const body = await req.json();
    const { email } = body;
    
    console.log("Request body - email:", email);
    
    if (!email) {
      console.log("Missing email");
      return new Response(
        JSON.stringify({ error: "Email é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find user by email using pagination
    console.log("Searching for user:", email);
    
    let targetUser: { id: string; email?: string } | null = null;
    let page = 1;
    const perPage = 1000;
    
    while (!targetUser) {
      const { data: usersPage, error: listError } = await adminClient.auth.admin.listUsers({
        page,
        perPage,
      });
      
      if (listError) {
        console.log("Error listing users:", listError.message);
        return new Response(
          JSON.stringify({ error: "Erro ao buscar usuário" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      console.log(`Page ${page}: found ${usersPage.users.length} users`);
      
      targetUser = usersPage.users.find(u => u.email?.toLowerCase() === email.toLowerCase()) || null;
      
      if (usersPage.users.length < perPage) {
        break; // Last page
      }
      
      page++;
    }

    if (!targetUser) {
      console.log("User not found:", email);
      return new Response(
        JSON.stringify({ 
          success: false,
          error: "Não existe usuário cadastrado com este email." 
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Found user:", targetUser.id, targetUser.email);

    // Set the password to "senha123"
    const newPassword = "senha123";
    
    const { error: updateError } = await adminClient.auth.admin.updateUserById(
      targetUser.id,
      { password: newPassword }
    );

    if (updateError) {
      console.error(`Error updating password for ${email}:`, updateError);
      return new Response(
        JSON.stringify({ error: "Erro ao redefinir senha" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Password reset successfully for: ${email}`);

    // Send email with the new password using fetch to Resend API
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0a0a0a;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0a0a0a; padding: 40px 20px;">
          <tr>
            <td align="center">
              <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 500px; background: linear-gradient(145deg, #1a1a1a 0%, #0d0d0d 100%); border-radius: 16px; border: 1px solid #333; overflow: hidden;">
                <tr>
                  <td style="padding: 40px 40px 20px 40px; text-align: center;">
                    <table cellpadding="0" cellspacing="0" style="margin: 0 auto 20px;">
                      <tr>
                        <td style="width: 64px; height: 64px; background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); border-radius: 16px; text-align: center; vertical-align: middle;">
                          <span style="color: white; font-size: 28px; font-weight: bold;">Z</span>
                        </td>
                      </tr>
                    </table>
                    <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">
                      Recuperação de Senha
                    </h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 0 40px 30px 40px;">
                    <p style="color: #a1a1aa; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0; text-align: center;">
                      Você solicitou a recuperação de senha da sua conta no ZapData. Sua nova senha foi definida:
                    </p>
                    <div style="background-color: #262626; border: 1px solid #404040; border-radius: 12px; padding: 20px; text-align: center; margin: 20px 0;">
                      <p style="color: #71717a; font-size: 12px; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 1px;">
                        Sua nova senha
                      </p>
                      <p style="color: #f97316; font-size: 28px; font-weight: 700; margin: 0; font-family: 'Courier New', monospace; letter-spacing: 3px;">
                        ${newPassword}
                      </p>
                    </div>
                    <p style="color: #a1a1aa; font-size: 14px; line-height: 1.6; margin: 0 0 25px 0; text-align: center;">
                      ⚠️ Por segurança, recomendamos que você altere sua senha após fazer login.
                    </p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center">
                          <a href="https://zapdata.co/" 
                             style="display: inline-block; background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); color: #ffffff; text-decoration: none; font-weight: 600; font-size: 15px; padding: 14px 32px; border-radius: 8px; box-shadow: 0 4px 15px rgba(249, 115, 22, 0.3);">
                            Acessar ZapData →
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 20px 40px 30px 40px; border-top: 1px solid #262626;">
                    <p style="color: #52525b; font-size: 12px; margin: 0; text-align: center; line-height: 1.5;">
                      Se você não solicitou esta recuperação de senha, ignore este email ou entre em contato conosco.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    // Use a verified domain if available, otherwise fallback to resend.dev (testing only)
    // Note: resend.dev only delivers to the email of the Resend account owner
    const fromEmail = "ZapData <no-reply@zapdata.co>";
    
    const emailPayload = {
      from: fromEmail,
      to: [email],
      subject: "Sua nova senha - ZapData",
      html: emailHtml,
    };
    
    console.log("Sending email with payload:", JSON.stringify({ ...emailPayload, html: "[HTML CONTENT]" }));
    
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(emailPayload),
    });

    const emailResult = await emailResponse.json();
    console.log("Email API response status:", emailResponse.status, "result:", JSON.stringify(emailResult));

    if (!emailResponse.ok) {
      console.error("Failed to send email:", emailResult);
      return new Response(
        JSON.stringify({ 
          success: false,
          error: `Erro ao enviar email: ${emailResult.message || emailResult.error || 'Erro desconhecido'}`
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        message: "Email enviado com sucesso! Verifique sua caixa de entrada e também a pasta de spam."
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Forgot password error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
