export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      admin_announcements: {
        Row: {
          clicks_count: number
          content: string
          created_at: string
          created_by: string | null
          id: string
          image_url: string | null
          is_active: boolean
          redirect_button_text: string | null
          redirect_system: string | null
          redirect_type: Database["public"]["Enums"]["announcement_redirect_type"]
          redirect_url: string | null
          scheduled_at: string | null
          title: string | null
          views_count: number
        }
        Insert: {
          clicks_count?: number
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          redirect_button_text?: string | null
          redirect_system?: string | null
          redirect_type?: Database["public"]["Enums"]["announcement_redirect_type"]
          redirect_url?: string | null
          scheduled_at?: string | null
          title?: string | null
          views_count?: number
        }
        Update: {
          clicks_count?: number
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          redirect_button_text?: string | null
          redirect_system?: string | null
          redirect_type?: Database["public"]["Enums"]["announcement_redirect_type"]
          redirect_url?: string | null
          scheduled_at?: string | null
          title?: string | null
          views_count?: number
        }
        Relationships: []
      }
      admin_favorite_users: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      admin_user_rankings: {
        Row: {
          id: string
          notes: string | null
          ranking: number | null
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          id?: string
          notes?: string | null
          ranking?: number | null
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          id?: string
          notes?: string | null
          ranking?: number | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: []
      }
      daily_update_status: {
        Row: {
          completed_at: string | null
          created_at: string
          failed_offers: number | null
          id: string
          is_running: boolean
          processed_offers: number | null
          started_at: string | null
          total_offers: number | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          failed_offers?: number | null
          id?: string
          is_running?: boolean
          processed_offers?: number | null
          started_at?: string | null
          total_offers?: number | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          failed_offers?: number | null
          id?: string
          is_running?: boolean
          processed_offers?: number | null
          started_at?: string | null
          total_offers?: number | null
        }
        Relationships: []
      }
      metrics: {
        Row: {
          conversion: number
          cpl: number
          created_at: string
          date: string
          id: string
          invested: number
          leads: number
          pix_count: number
          pix_total: number
          product_id: string
          product_name: string
          result: number
          roas: number
          structure: string
        }
        Insert: {
          conversion: number
          cpl: number
          created_at?: string
          date: string
          id?: string
          invested: number
          leads: number
          pix_count: number
          pix_total: number
          product_id: string
          product_name: string
          result: number
          roas: number
          structure: string
        }
        Update: {
          conversion?: number
          cpl?: number
          created_at?: string
          date?: string
          id?: string
          invested?: number
          leads?: number
          pix_count?: number
          pix_total?: number
          product_id?: string
          product_name?: string
          result?: number
          roas?: number
          structure?: string
        }
        Relationships: [
          {
            foreignKeyName: "metrics_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      offer_metrics: {
        Row: {
          active_ads_count: number
          created_at: string
          date: string
          id: string
          is_invalid_link: boolean
          offer_id: string
        }
        Insert: {
          active_ads_count: number
          created_at?: string
          date: string
          id?: string
          is_invalid_link?: boolean
          offer_id: string
        }
        Update: {
          active_ads_count?: number
          created_at?: string
          date?: string
          id?: string
          is_invalid_link?: boolean
          offer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "offer_metrics_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "tracked_offers"
            referencedColumns: ["id"]
          },
        ]
      }
      organized_numbers: {
        Row: {
          celular: string
          created_at: string
          id: string
          numero: string
          operacao: string
          order_position: number | null
          status: string
          user_id: string
        }
        Insert: {
          celular: string
          created_at?: string
          id?: string
          numero: string
          operacao: string
          order_position?: number | null
          status: string
          user_id: string
        }
        Update: {
          celular?: string
          created_at?: string
          id?: string
          numero?: string
          operacao?: string
          order_position?: number | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      platform_margins: {
        Row: {
          id: string
          margin_percent: number
          system_name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          margin_percent?: number
          system_name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          margin_percent?: number
          system_name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      products: {
        Row: {
          created_at: string
          id: string
          last_update: string
          name: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          last_update: string
          name: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          last_update?: string
          name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          id: string
          username: string
        }
        Insert: {
          created_at?: string
          id: string
          username: string
        }
        Update: {
          created_at?: string
          id?: string
          username?: string
        }
        Relationships: []
      }
      saved_funnels: {
        Row: {
          config: Json
          created_at: string
          funnel_content: Json | null
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          config: Json
          created_at?: string
          funnel_content?: Json | null
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          config?: Json
          created_at?: string
          funnel_content?: Json | null
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      smm_orders: {
        Row: {
          category: string | null
          created_at: string
          id: string
          link: string
          price_brl: number
          price_usd: number
          quantity: number
          remains: number | null
          service_id: string
          service_name: string
          smm_raja_order_id: string | null
          start_count: number | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          link: string
          price_brl: number
          price_usd: number
          quantity: number
          remains?: number | null
          service_id: string
          service_name: string
          smm_raja_order_id?: string | null
          start_count?: number | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          link?: string
          price_brl?: number
          price_usd?: number
          quantity?: number
          remains?: number | null
          service_id?: string
          service_name?: string
          smm_raja_order_id?: string | null
          start_count?: number | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sms_orders: {
        Row: {
          country_code: string | null
          created_at: string
          expires_at: string | null
          id: string
          phone_number: string | null
          price: number
          service_code: string
          service_name: string | null
          sms_activate_id: string
          sms_code: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          country_code?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          phone_number?: string | null
          price: number
          service_code: string
          service_name?: string | null
          sms_activate_id: string
          sms_code?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          country_code?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          phone_number?: string | null
          price?: number
          service_code?: string
          service_name?: string | null
          sms_activate_id?: string
          sms_code?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sms_transactions: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          external_id: string | null
          id: string
          order_id: string | null
          pix_copy_paste: string | null
          pix_qr_code: string | null
          status: string | null
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          description?: string | null
          external_id?: string | null
          id?: string
          order_id?: string | null
          pix_copy_paste?: string | null
          pix_qr_code?: string | null
          status?: string | null
          type: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          external_id?: string | null
          id?: string
          order_id?: string | null
          pix_copy_paste?: string | null
          pix_qr_code?: string | null
          status?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "sms_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_user_wallets: {
        Row: {
          balance: number
          country_code: string | null
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          country_code?: string | null
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          country_code?: string | null
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tracked_offers: {
        Row: {
          ad_library_link: string
          admin_status: Database["public"]["Enums"]["admin_offer_status"] | null
          created_at: string
          funnel_number: string | null
          id: string
          name: string
          notes: string | null
          user_id: string
        }
        Insert: {
          ad_library_link: string
          admin_status?:
            | Database["public"]["Enums"]["admin_offer_status"]
            | null
          created_at?: string
          funnel_number?: string | null
          id?: string
          name: string
          notes?: string | null
          user_id: string
        }
        Update: {
          ad_library_link?: string
          admin_status?:
            | Database["public"]["Enums"]["admin_offer_status"]
            | null
          created_at?: string
          funnel_number?: string | null
          id?: string
          name?: string
          notes?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_activities: {
        Row: {
          activity_name: string
          activity_type: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          activity_name: string
          activity_type: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          activity_name?: string
          activity_type?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      user_announcement_views: {
        Row: {
          announcement_id: string
          clicked: boolean
          id: string
          user_id: string
          viewed_at: string
        }
        Insert: {
          announcement_id: string
          clicked?: boolean
          id?: string
          user_id: string
          viewed_at?: string
        }
        Update: {
          announcement_id?: string
          clicked?: boolean
          id?: string
          user_id?: string
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_announcement_views_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "admin_announcements"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      video_creative_analyses: {
        Row: {
          body_analysis: string
          body_score: number
          coherence_analysis: string
          coherence_score: number
          created_at: string
          cta_analysis: string
          cta_score: number
          hook_analysis: string
          hook_score: number
          id: string
          overall_analysis: string
          overall_score: number
          transcription: string | null
          user_id: string
          video_name: string
          video_url: string
        }
        Insert: {
          body_analysis: string
          body_score: number
          coherence_analysis: string
          coherence_score: number
          created_at?: string
          cta_analysis: string
          cta_score: number
          hook_analysis: string
          hook_score: number
          id?: string
          overall_analysis: string
          overall_score: number
          transcription?: string | null
          user_id: string
          video_name: string
          video_url: string
        }
        Update: {
          body_analysis?: string
          body_score?: number
          coherence_analysis?: string
          coherence_score?: number
          created_at?: string
          cta_analysis?: string
          cta_score?: number
          hook_analysis?: string
          hook_score?: number
          id?: string
          overall_analysis?: string
          overall_score?: number
          transcription?: string | null
          user_id?: string
          video_name?: string
          video_url?: string
        }
        Relationships: []
      }
      video_generation_jobs: {
        Row: {
          created_at: string
          id: string
          render_id: string
          status: string
          updated_at: string
          user_id: string
          variation_name: string
          video_url: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          render_id: string
          status?: string
          updated_at?: string
          user_id: string
          variation_name: string
          video_url?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          render_id?: string
          status?: string
          updated_at?: string
          user_id?: string
          variation_name?: string
          video_url?: string | null
        }
        Relationships: []
      }
      voice_previews: {
        Row: {
          audio_base64: string
          created_at: string
          id: string
          voice_id: string
          voice_name: string
        }
        Insert: {
          audio_base64: string
          created_at?: string
          id?: string
          voice_id: string
          voice_name: string
        }
        Update: {
          audio_base64?: string
          created_at?: string
          id?: string
          voice_id?: string
          voice_name?: string
        }
        Relationships: []
      }
      zap_spy_offers: {
        Row: {
          active_ads_count: number | null
          ad_library_link: string
          created_at: string
          created_by: string | null
          id: string
          image_url: string | null
          is_featured: boolean
          is_hidden: boolean
          name: string
          niche: string
          start_date: string | null
        }
        Insert: {
          active_ads_count?: number | null
          ad_library_link: string
          created_at?: string
          created_by?: string | null
          id?: string
          image_url?: string | null
          is_featured?: boolean
          is_hidden?: boolean
          name: string
          niche: string
          start_date?: string | null
        }
        Update: {
          active_ads_count?: number | null
          ad_library_link?: string
          created_at?: string
          created_by?: string | null
          id?: string
          image_url?: string | null
          is_featured?: boolean
          is_hidden?: boolean
          name?: string
          niche?: string
          start_date?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      metrics_with_product: {
        Row: {
          conversion: number | null
          cpl: number | null
          created_at: string | null
          date: string | null
          id: string | null
          invested: number | null
          leads: number | null
          pix_count: number | null
          pix_total: number | null
          product_id: string | null
          product_name: string | null
          result: number | null
          roas: number | null
          structure: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "metrics_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      admin_offer_status: "minerada" | "ruim" | "boa"
      announcement_redirect_type: "none" | "custom_link" | "system"
      app_role: "admin" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      admin_offer_status: ["minerada", "ruim", "boa"],
      announcement_redirect_type: ["none", "custom_link", "system"],
      app_role: ["admin", "user"],
    },
  },
} as const
