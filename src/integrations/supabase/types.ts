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
      tracked_offers: {
        Row: {
          ad_library_link: string
          created_at: string
          id: string
          name: string
          notes: string | null
          user_id: string
        }
        Insert: {
          ad_library_link: string
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          user_id: string
        }
        Update: {
          ad_library_link?: string
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          user_id?: string
        }
        Relationships: []
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
      app_role: ["admin", "user"],
    },
  },
} as const
