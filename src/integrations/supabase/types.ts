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
      admin_notifications: {
        Row: {
          action_description: string
          action_type: string
          amount: number | null
          created_at: string
          id: string
          is_read: boolean
          user_email: string
          user_id: string
        }
        Insert: {
          action_description: string
          action_type: string
          amount?: number | null
          created_at?: string
          id?: string
          is_read?: boolean
          user_email: string
          user_id: string
        }
        Update: {
          action_description?: string
          action_type?: string
          amount?: number | null
          created_at?: string
          id?: string
          is_read?: boolean
          user_email?: string
          user_id?: string
        }
        Relationships: []
      }
      admin_notify_configs: {
        Row: {
          admin_instance_ids: string[] | null
          created_at: string
          id: string
          notifier_instance_id: string | null
          status_monitor_enabled: boolean | null
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_instance_ids?: string[] | null
          created_at?: string
          id?: string
          notifier_instance_id?: string | null
          status_monitor_enabled?: boolean | null
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_instance_ids?: string[] | null
          created_at?: string
          id?: string
          notifier_instance_id?: string | null
          status_monitor_enabled?: boolean | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_notify_configs_notifier_instance_id_fkey"
            columns: ["notifier_instance_id"]
            isOneToOne: false
            referencedRelation: "maturador_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_notify_daily_counts: {
        Row: {
          conversation_count: number
          created_at: string
          date: string
          id: string
          instance_id: string
          limit_notified: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          conversation_count?: number
          created_at?: string
          date?: string
          id?: string
          instance_id: string
          limit_notified?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          conversation_count?: number
          created_at?: string
          date?: string
          id?: string
          instance_id?: string
          limit_notified?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_notify_daily_counts_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "maturador_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_notify_instance_monitor: {
        Row: {
          config_id: string
          created_at: string
          id: string
          instance_id: string
          is_active: boolean
          user_id: string
        }
        Insert: {
          config_id: string
          created_at?: string
          id?: string
          instance_id: string
          is_active?: boolean
          user_id: string
        }
        Update: {
          config_id?: string
          created_at?: string
          id?: string
          instance_id?: string
          is_active?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_notify_instance_monitor_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "admin_notify_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_notify_instance_monitor_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "maturador_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_notify_lead_limits: {
        Row: {
          config_id: string
          created_at: string
          daily_limit: number
          id: string
          instance_id: string
          is_active: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          config_id: string
          created_at?: string
          daily_limit?: number
          id?: string
          instance_id: string
          is_active?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          config_id?: string
          created_at?: string
          daily_limit?: number
          id?: string
          instance_id?: string
          is_active?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_notify_lead_limits_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "admin_notify_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_notify_lead_limits_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "maturador_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_notify_sales_monitor: {
        Row: {
          config_id: string
          created_at: string
          id: string
          instance_id: string
          is_active: boolean
          user_id: string
        }
        Insert: {
          config_id: string
          created_at?: string
          id?: string
          instance_id: string
          is_active?: boolean
          user_id: string
        }
        Update: {
          config_id?: string
          created_at?: string
          id?: string
          instance_id?: string
          is_active?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_notify_sales_monitor_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "admin_notify_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_notify_sales_monitor_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "maturador_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_role_audit_log: {
        Row: {
          action: string
          created_at: string | null
          error_message: string | null
          id: string
          performed_by: string | null
          role_affected: string
          success: boolean
          target_user_id: string
        }
        Insert: {
          action: string
          created_at?: string | null
          error_message?: string | null
          id?: string
          performed_by?: string | null
          role_affected: string
          success?: boolean
          target_user_id: string
        }
        Update: {
          action?: string
          created_at?: string | null
          error_message?: string | null
          id?: string
          performed_by?: string | null
          role_affected?: string
          success?: boolean
          target_user_id?: string
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
      ads_ad_accounts: {
        Row: {
          account_status: number | null
          ad_account_id: string
          created_at: string
          currency: string | null
          facebook_account_id: string | null
          id: string
          is_selected: boolean | null
          name: string | null
          timezone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_status?: number | null
          ad_account_id: string
          created_at?: string
          currency?: string | null
          facebook_account_id?: string | null
          id?: string
          is_selected?: boolean | null
          name?: string | null
          timezone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_status?: number | null
          ad_account_id?: string
          created_at?: string
          currency?: string | null
          facebook_account_id?: string | null
          id?: string
          is_selected?: boolean | null
          name?: string | null
          timezone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ads_ad_accounts_facebook_account_id_fkey"
            columns: ["facebook_account_id"]
            isOneToOne: false
            referencedRelation: "ads_facebook_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      ads_ads: {
        Row: {
          ad_account_id: string | null
          ad_id: string
          adset_id: string
          campaign_id: string
          clicks: number | null
          conversion_value: number | null
          cost_per_message: number | null
          cost_per_result: number | null
          cpc: number | null
          cpm: number | null
          created_at: string
          creative_id: string | null
          ctr: number | null
          id: string
          impressions: number | null
          last_synced_at: string | null
          messaging_conversations_started: number | null
          meta_conversions: number | null
          name: string | null
          reach: number | null
          results: number | null
          spend: number | null
          status: string | null
          thumbnail_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ad_account_id?: string | null
          ad_id: string
          adset_id: string
          campaign_id: string
          clicks?: number | null
          conversion_value?: number | null
          cost_per_message?: number | null
          cost_per_result?: number | null
          cpc?: number | null
          cpm?: number | null
          created_at?: string
          creative_id?: string | null
          ctr?: number | null
          id?: string
          impressions?: number | null
          last_synced_at?: string | null
          messaging_conversations_started?: number | null
          meta_conversions?: number | null
          name?: string | null
          reach?: number | null
          results?: number | null
          spend?: number | null
          status?: string | null
          thumbnail_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ad_account_id?: string | null
          ad_id?: string
          adset_id?: string
          campaign_id?: string
          clicks?: number | null
          conversion_value?: number | null
          cost_per_message?: number | null
          cost_per_result?: number | null
          cpc?: number | null
          cpm?: number | null
          created_at?: string
          creative_id?: string | null
          ctr?: number | null
          id?: string
          impressions?: number | null
          last_synced_at?: string | null
          messaging_conversations_started?: number | null
          meta_conversions?: number | null
          name?: string | null
          reach?: number | null
          results?: number | null
          spend?: number | null
          status?: string | null
          thumbnail_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ads_ads_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: false
            referencedRelation: "ads_ad_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      ads_adsets: {
        Row: {
          ad_account_id: string | null
          adset_id: string
          campaign_id: string
          clicks: number | null
          conversion_value: number | null
          cost_per_message: number | null
          cost_per_result: number | null
          cpc: number | null
          cpm: number | null
          created_at: string
          ctr: number | null
          daily_budget: number | null
          id: string
          impressions: number | null
          last_synced_at: string | null
          lifetime_budget: number | null
          messaging_conversations_started: number | null
          meta_conversions: number | null
          name: string | null
          reach: number | null
          results: number | null
          spend: number | null
          status: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ad_account_id?: string | null
          adset_id: string
          campaign_id: string
          clicks?: number | null
          conversion_value?: number | null
          cost_per_message?: number | null
          cost_per_result?: number | null
          cpc?: number | null
          cpm?: number | null
          created_at?: string
          ctr?: number | null
          daily_budget?: number | null
          id?: string
          impressions?: number | null
          last_synced_at?: string | null
          lifetime_budget?: number | null
          messaging_conversations_started?: number | null
          meta_conversions?: number | null
          name?: string | null
          reach?: number | null
          results?: number | null
          spend?: number | null
          status?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ad_account_id?: string | null
          adset_id?: string
          campaign_id?: string
          clicks?: number | null
          conversion_value?: number | null
          cost_per_message?: number | null
          cost_per_result?: number | null
          cpc?: number | null
          cpm?: number | null
          created_at?: string
          ctr?: number | null
          daily_budget?: number | null
          id?: string
          impressions?: number | null
          last_synced_at?: string | null
          lifetime_budget?: number | null
          messaging_conversations_started?: number | null
          meta_conversions?: number | null
          name?: string | null
          reach?: number | null
          results?: number | null
          spend?: number | null
          status?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ads_adsets_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: false
            referencedRelation: "ads_ad_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      ads_alert_numbers: {
        Row: {
          created_at: string
          id: string
          is_active: boolean | null
          label: string | null
          phone_number: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          label?: string | null
          phone_number: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          label?: string | null
          phone_number?: string
          user_id?: string
        }
        Relationships: []
      }
      ads_alerts: {
        Row: {
          ad_account_id: string | null
          alert_type: string
          campaign_id: string | null
          created_at: string
          id: string
          is_read: boolean | null
          message: string | null
          title: string
          user_id: string
        }
        Insert: {
          ad_account_id?: string | null
          alert_type: string
          campaign_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean | null
          message?: string | null
          title: string
          user_id: string
        }
        Update: {
          ad_account_id?: string | null
          alert_type?: string
          campaign_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean | null
          message?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      ads_campaigns: {
        Row: {
          ad_account_id: string | null
          campaign_id: string
          clicks: number | null
          conversion_value: number | null
          conversions: number | null
          cost_per_message: number | null
          cost_per_result: number | null
          cpc: number | null
          cpm: number | null
          created_at: string
          ctr: number | null
          daily_budget: number | null
          id: string
          impressions: number | null
          last_synced_at: string | null
          lifetime_budget: number | null
          messaging_conversations_started: number | null
          meta_conversions: number | null
          name: string | null
          objective: string | null
          reach: number | null
          results: number | null
          spend: number | null
          status: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ad_account_id?: string | null
          campaign_id: string
          clicks?: number | null
          conversion_value?: number | null
          conversions?: number | null
          cost_per_message?: number | null
          cost_per_result?: number | null
          cpc?: number | null
          cpm?: number | null
          created_at?: string
          ctr?: number | null
          daily_budget?: number | null
          id?: string
          impressions?: number | null
          last_synced_at?: string | null
          lifetime_budget?: number | null
          messaging_conversations_started?: number | null
          meta_conversions?: number | null
          name?: string | null
          objective?: string | null
          reach?: number | null
          results?: number | null
          spend?: number | null
          status?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ad_account_id?: string | null
          campaign_id?: string
          clicks?: number | null
          conversion_value?: number | null
          conversions?: number | null
          cost_per_message?: number | null
          cost_per_result?: number | null
          cpc?: number | null
          cpm?: number | null
          created_at?: string
          ctr?: number | null
          daily_budget?: number | null
          id?: string
          impressions?: number | null
          last_synced_at?: string | null
          lifetime_budget?: number | null
          messaging_conversations_started?: number | null
          meta_conversions?: number | null
          name?: string | null
          objective?: string | null
          reach?: number | null
          results?: number | null
          spend?: number | null
          status?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ads_campaigns_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: false
            referencedRelation: "ads_ad_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      ads_facebook_accounts: {
        Row: {
          access_token: string
          created_at: string
          email: string | null
          facebook_user_id: string
          id: string
          name: string | null
          profile_pic_url: string | null
          token_expires_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string
          email?: string | null
          facebook_user_id: string
          id?: string
          name?: string | null
          profile_pic_url?: string | null
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string
          email?: string | null
          facebook_user_id?: string
          id?: string
          name?: string | null
          profile_pic_url?: string | null
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ads_lead_ingest_logs: {
        Row: {
          created_at: string
          ctwa_source: string | null
          event_type: string | null
          id: string
          instance_id: string | null
          payload_hash: string | null
          payload_snippet: Json | null
          phone_prefix: string | null
          phone_source: string | null
          reason: string
          remote_jid: string | null
          resolved: boolean | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          ctwa_source?: string | null
          event_type?: string | null
          id?: string
          instance_id?: string | null
          payload_hash?: string | null
          payload_snippet?: Json | null
          phone_prefix?: string | null
          phone_source?: string | null
          reason: string
          remote_jid?: string | null
          resolved?: boolean | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          ctwa_source?: string | null
          event_type?: string | null
          id?: string
          instance_id?: string | null
          payload_hash?: string | null
          payload_snippet?: Json | null
          phone_prefix?: string | null
          phone_source?: string | null
          reason?: string
          remote_jid?: string | null
          resolved?: boolean | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ads_lead_ingest_logs_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "maturador_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      ads_pixels: {
        Row: {
          ad_account_id: string
          created_at: string
          id: string
          is_selected: boolean | null
          name: string | null
          pixel_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ad_account_id: string
          created_at?: string
          id?: string
          is_selected?: boolean | null
          name?: string | null
          pixel_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ad_account_id?: string
          created_at?: string
          id?: string
          is_selected?: boolean | null
          name?: string | null
          pixel_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ads_pixels_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: false
            referencedRelation: "ads_ad_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      ads_whatsapp_leads: {
        Row: {
          ad_account_id: string | null
          ad_id: string | null
          ad_source_url: string | null
          adset_id: string | null
          campaign_id: string | null
          created_at: string
          ctwa_clid: string | null
          fbclid: string | null
          first_contact_at: string
          first_message: string | null
          id: string
          instance_id: string | null
          name: string | null
          phone: string
          profile_pic_url: string | null
          purchase_sent_at: string | null
          purchase_value: number | null
          updated_at: string
          user_id: string
          whatsapp_number_id: string | null
        }
        Insert: {
          ad_account_id?: string | null
          ad_id?: string | null
          ad_source_url?: string | null
          adset_id?: string | null
          campaign_id?: string | null
          created_at?: string
          ctwa_clid?: string | null
          fbclid?: string | null
          first_contact_at?: string
          first_message?: string | null
          id?: string
          instance_id?: string | null
          name?: string | null
          phone: string
          profile_pic_url?: string | null
          purchase_sent_at?: string | null
          purchase_value?: number | null
          updated_at?: string
          user_id: string
          whatsapp_number_id?: string | null
        }
        Update: {
          ad_account_id?: string | null
          ad_id?: string | null
          ad_source_url?: string | null
          adset_id?: string | null
          campaign_id?: string | null
          created_at?: string
          ctwa_clid?: string | null
          fbclid?: string | null
          first_contact_at?: string
          first_message?: string | null
          id?: string
          instance_id?: string | null
          name?: string | null
          phone?: string
          profile_pic_url?: string | null
          purchase_sent_at?: string | null
          purchase_value?: number | null
          updated_at?: string
          user_id?: string
          whatsapp_number_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ads_whatsapp_leads_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: false
            referencedRelation: "ads_ad_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ads_whatsapp_leads_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "maturador_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ads_whatsapp_leads_whatsapp_number_id_fkey"
            columns: ["whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "ads_whatsapp_numbers"
            referencedColumns: ["id"]
          },
        ]
      }
      ads_whatsapp_numbers: {
        Row: {
          created_at: string
          id: string
          instance_id: string | null
          is_active: boolean | null
          label: string | null
          phone_number: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          instance_id?: string | null
          is_active?: boolean | null
          label?: string | null
          phone_number: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          instance_id?: string | null
          is_active?: boolean | null
          label?: string | null
          phone_number?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ads_whatsapp_numbers_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "maturador_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_creative_learnings: {
        Row: {
          analysis_result: Json
          created_at: string
          creative_type: string
          creative_url: string | null
          id: string
          improvement_points: Json | null
          niche: string | null
          transcription: string | null
          user_feedback: string | null
          user_id: string
          user_rating: number | null
        }
        Insert: {
          analysis_result: Json
          created_at?: string
          creative_type: string
          creative_url?: string | null
          id?: string
          improvement_points?: Json | null
          niche?: string | null
          transcription?: string | null
          user_feedback?: string | null
          user_id: string
          user_rating?: number | null
        }
        Update: {
          analysis_result?: Json
          created_at?: string
          creative_type?: string
          creative_url?: string | null
          id?: string
          improvement_points?: Json | null
          niche?: string | null
          transcription?: string | null
          user_feedback?: string | null
          user_id?: string
          user_rating?: number | null
        }
        Relationships: []
      }
      ai_funnel_learnings: {
        Row: {
          created_at: string
          edit_suggestions: string[] | null
          funnel_config: Json
          funnel_content: Json
          id: string
          niche: string | null
          pegada: string | null
          tone: string | null
          user_feedback: string | null
          user_id: string
          user_rating: number | null
        }
        Insert: {
          created_at?: string
          edit_suggestions?: string[] | null
          funnel_config: Json
          funnel_content: Json
          id?: string
          niche?: string | null
          pegada?: string | null
          tone?: string | null
          user_feedback?: string | null
          user_id: string
          user_rating?: number | null
        }
        Update: {
          created_at?: string
          edit_suggestions?: string[] | null
          funnel_config?: Json
          funnel_content?: Json
          id?: string
          niche?: string | null
          pegada?: string | null
          tone?: string | null
          user_feedback?: string | null
          user_id?: string
          user_rating?: number | null
        }
        Relationships: []
      }
      ai_success_patterns: {
        Row: {
          created_at: string
          id: string
          pattern_data: Json
          pattern_description: string
          pattern_name: string
          pattern_type: string
          success_rate: number | null
          updated_at: string
          usage_count: number
        }
        Insert: {
          created_at?: string
          id?: string
          pattern_data: Json
          pattern_description: string
          pattern_name: string
          pattern_type: string
          success_rate?: number | null
          updated_at?: string
          usage_count?: number
        }
        Update: {
          created_at?: string
          id?: string
          pattern_data?: Json
          pattern_description?: string
          pattern_name?: string
          pattern_type?: string
          success_rate?: number | null
          updated_at?: string
          usage_count?: number
        }
        Relationships: []
      }
      blaster_campaigns: {
        Row: {
          assigned_instances: string[] | null
          completed_at: string | null
          created_at: string
          current_index: number
          delay_max: number
          delay_min: number
          dispatches_per_instance: number | null
          failed_count: number
          flow_id: string | null
          id: string
          media_type: string | null
          media_url: string | null
          message_variations: Json
          name: string
          phone_numbers: Json
          sent_count: number
          started_at: string | null
          status: string
          total_count: number
          uazapi_folder_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_instances?: string[] | null
          completed_at?: string | null
          created_at?: string
          current_index?: number
          delay_max?: number
          delay_min?: number
          dispatches_per_instance?: number | null
          failed_count?: number
          flow_id?: string | null
          id?: string
          media_type?: string | null
          media_url?: string | null
          message_variations?: Json
          name: string
          phone_numbers?: Json
          sent_count?: number
          started_at?: string | null
          status?: string
          total_count?: number
          uazapi_folder_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_instances?: string[] | null
          completed_at?: string | null
          created_at?: string
          current_index?: number
          delay_max?: number
          delay_min?: number
          dispatches_per_instance?: number | null
          failed_count?: number
          flow_id?: string | null
          id?: string
          media_type?: string | null
          media_url?: string | null
          message_variations?: Json
          name?: string
          phone_numbers?: Json
          sent_count?: number
          started_at?: string | null
          status?: string
          total_count?: number
          uazapi_folder_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "blaster_campaigns_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "inbox_flows"
            referencedColumns: ["id"]
          },
        ]
      }
      blaster_logs: {
        Row: {
          campaign_id: string
          created_at: string
          error_message: string | null
          id: string
          instance_id: string | null
          message: string
          phone: string
          sent_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          error_message?: string | null
          id?: string
          instance_id?: string | null
          message: string
          phone: string
          sent_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          error_message?: string | null
          id?: string
          instance_id?: string | null
          message?: string
          phone?: string
          sent_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "blaster_logs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "blaster_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      cloned_sites: {
        Row: {
          analysis_result: Json
          created_at: string
          description: string | null
          generated_prompt: string
          id: string
          title: string | null
          url: string
          user_id: string
        }
        Insert: {
          analysis_result: Json
          created_at?: string
          description?: string | null
          generated_prompt: string
          id?: string
          title?: string | null
          url: string
          user_id: string
        }
        Update: {
          analysis_result?: Json
          created_at?: string
          description?: string | null
          generated_prompt?: string
          id?: string
          title?: string | null
          url?: string
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
      feed_comments: {
        Row: {
          content: string
          created_at: string
          id: string
          post_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          post_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          post_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feed_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "feed_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_likes: {
        Row: {
          created_at: string
          id: string
          post_id: string
          reaction: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          reaction?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          reaction?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feed_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "feed_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_posts: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          comments_count: number
          content: string | null
          created_at: string
          id: string
          likes_count: number
          media_type: string | null
          media_url: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          comments_count?: number
          content?: string | null
          created_at?: string
          id?: string
          likes_count?: number
          media_type?: string | null
          media_url?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          comments_count?: number
          content?: string | null
          created_at?: string
          id?: string
          likes_count?: number
          media_type?: string | null
          media_url?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      inbox_contacts: {
        Row: {
          ad_body: string | null
          ad_source_url: string | null
          ad_title: string | null
          assigned_to: string | null
          created_at: string
          ctwa_clid: string | null
          flow_paused: boolean | null
          id: string
          instance_id: string | null
          is_ignored: boolean | null
          last_message_at: string | null
          name: string | null
          notes: string | null
          phone: string
          profile_pic_url: string | null
          remote_jid: string | null
          status: string
          tags: Json | null
          unread_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          ad_body?: string | null
          ad_source_url?: string | null
          ad_title?: string | null
          assigned_to?: string | null
          created_at?: string
          ctwa_clid?: string | null
          flow_paused?: boolean | null
          id?: string
          instance_id?: string | null
          is_ignored?: boolean | null
          last_message_at?: string | null
          name?: string | null
          notes?: string | null
          phone: string
          profile_pic_url?: string | null
          remote_jid?: string | null
          status?: string
          tags?: Json | null
          unread_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          ad_body?: string | null
          ad_source_url?: string | null
          ad_title?: string | null
          assigned_to?: string | null
          created_at?: string
          ctwa_clid?: string | null
          flow_paused?: boolean | null
          id?: string
          instance_id?: string | null
          is_ignored?: boolean | null
          last_message_at?: string | null
          name?: string | null
          notes?: string | null
          phone?: string
          profile_pic_url?: string | null
          remote_jid?: string | null
          status?: string
          tags?: Json | null
          unread_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inbox_contacts_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "maturador_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      inbox_custom_variables: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      inbox_flow_analytics: {
        Row: {
          created_at: string
          flow_id: string
          id: string
          node_id: string
          node_type: string
          session_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          flow_id: string
          id?: string
          node_id: string
          node_type: string
          session_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          flow_id?: string
          id?: string
          node_id?: string
          node_type?: string
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inbox_flow_analytics_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "inbox_flows"
            referencedColumns: ["id"]
          },
        ]
      }
      inbox_flow_delay_jobs: {
        Row: {
          attempts: number
          created_at: string
          last_error: string | null
          run_at: string
          session_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          last_error?: string | null
          run_at: string
          session_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          last_error?: string | null
          run_at?: string
          session_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      inbox_flow_sessions: {
        Row: {
          contact_id: string
          current_node_id: string | null
          flow_id: string
          id: string
          instance_id: string | null
          last_interaction: string
          processing: boolean | null
          processing_started_at: string | null
          started_at: string
          status: string
          timeout_at: string | null
          user_id: string
          variables: Json | null
        }
        Insert: {
          contact_id: string
          current_node_id?: string | null
          flow_id: string
          id?: string
          instance_id?: string | null
          last_interaction?: string
          processing?: boolean | null
          processing_started_at?: string | null
          started_at?: string
          status?: string
          timeout_at?: string | null
          user_id: string
          variables?: Json | null
        }
        Update: {
          contact_id?: string
          current_node_id?: string | null
          flow_id?: string
          id?: string
          instance_id?: string | null
          last_interaction?: string
          processing?: boolean | null
          processing_started_at?: string | null
          started_at?: string
          status?: string
          timeout_at?: string | null
          user_id?: string
          variables?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "inbox_flow_sessions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "inbox_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbox_flow_sessions_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "inbox_flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbox_flow_sessions_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "maturador_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      inbox_flows: {
        Row: {
          assigned_instances: string[] | null
          created_at: string
          description: string | null
          edges: Json
          id: string
          is_active: boolean
          name: string
          nodes: Json
          pause_on_media: boolean | null
          pause_schedule_enabled: boolean | null
          pause_schedule_end: string | null
          pause_schedule_start: string | null
          priority: number
          reply_interval: number | null
          reply_mode: string | null
          reply_to_last_message: boolean | null
          trigger_keywords: string[] | null
          trigger_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_instances?: string[] | null
          created_at?: string
          description?: string | null
          edges?: Json
          id?: string
          is_active?: boolean
          name: string
          nodes?: Json
          pause_on_media?: boolean | null
          pause_schedule_enabled?: boolean | null
          pause_schedule_end?: string | null
          pause_schedule_start?: string | null
          priority?: number
          reply_interval?: number | null
          reply_mode?: string | null
          reply_to_last_message?: boolean | null
          trigger_keywords?: string[] | null
          trigger_type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_instances?: string[] | null
          created_at?: string
          description?: string | null
          edges?: Json
          id?: string
          is_active?: boolean
          name?: string
          nodes?: Json
          pause_on_media?: boolean | null
          pause_schedule_enabled?: boolean | null
          pause_schedule_end?: string | null
          pause_schedule_start?: string | null
          priority?: number
          reply_interval?: number | null
          reply_mode?: string | null
          reply_to_last_message?: boolean | null
          trigger_keywords?: string[] | null
          trigger_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      inbox_messages: {
        Row: {
          contact_id: string
          content: string | null
          created_at: string
          direction: string
          flow_id: string | null
          id: string
          instance_id: string | null
          is_from_flow: boolean
          media_pending: boolean | null
          media_url: string | null
          message_type: string
          remote_message_id: string | null
          reply_to_message_id: string | null
          status: string
          user_id: string
        }
        Insert: {
          contact_id: string
          content?: string | null
          created_at?: string
          direction: string
          flow_id?: string | null
          id?: string
          instance_id?: string | null
          is_from_flow?: boolean
          media_pending?: boolean | null
          media_url?: string | null
          message_type?: string
          remote_message_id?: string | null
          reply_to_message_id?: string | null
          status?: string
          user_id: string
        }
        Update: {
          contact_id?: string
          content?: string | null
          created_at?: string
          direction?: string
          flow_id?: string | null
          id?: string
          instance_id?: string | null
          is_from_flow?: boolean
          media_pending?: boolean | null
          media_url?: string | null
          message_type?: string
          remote_message_id?: string | null
          reply_to_message_id?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inbox_messages_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "inbox_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbox_messages_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "maturador_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbox_messages_reply_to_message_id_fkey"
            columns: ["reply_to_message_id"]
            isOneToOne: false
            referencedRelation: "inbox_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      inbox_quick_replies: {
        Row: {
          attachments: Json | null
          content: string
          created_at: string
          id: string
          shortcut: string
          user_id: string
        }
        Insert: {
          attachments?: Json | null
          content: string
          created_at?: string
          id?: string
          shortcut: string
          user_id: string
        }
        Update: {
          attachments?: Json | null
          content?: string
          created_at?: string
          id?: string
          shortcut?: string
          user_id?: string
        }
        Relationships: []
      }
      inbox_tags: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      marketplace_orders: {
        Row: {
          created_at: string
          customer_name: string | null
          customer_whatsapp: string | null
          id: string
          product_id: string
          product_name: string
          quantity: number
          status: string
          total_price: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          customer_name?: string | null
          customer_whatsapp?: string | null
          id?: string
          product_id: string
          product_name: string
          quantity?: number
          status?: string
          total_price: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          customer_name?: string | null
          customer_whatsapp?: string | null
          id?: string
          product_id?: string
          product_name?: string
          quantity?: number
          status?: string
          total_price?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "marketplace_products"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_products: {
        Row: {
          category: string
          compare_price: number | null
          created_at: string
          description: string
          discount_percent: number | null
          id: string
          image_url: string | null
          is_sold_out: boolean
          name: string
          price: number
          sold_count: number | null
          stock: number | null
          updated_at: string
        }
        Insert: {
          category: string
          compare_price?: number | null
          created_at?: string
          description: string
          discount_percent?: number | null
          id?: string
          image_url?: string | null
          is_sold_out?: boolean
          name: string
          price: number
          sold_count?: number | null
          stock?: number | null
          updated_at?: string
        }
        Update: {
          category?: string
          compare_price?: number | null
          created_at?: string
          description?: string
          discount_percent?: number | null
          id?: string
          image_url?: string | null
          is_sold_out?: boolean
          name?: string
          price?: number
          sold_count?: number | null
          stock?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      maturador_config: {
        Row: {
          created_at: string
          evolution_api_key: string
          evolution_base_url: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          evolution_api_key: string
          evolution_base_url: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          evolution_api_key?: string
          evolution_base_url?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      maturador_conversations: {
        Row: {
          chip_a_id: string | null
          chip_b_id: string | null
          created_at: string
          daily_limit: number
          enable_calls: boolean | null
          id: string
          is_active: boolean
          max_delay_seconds: number
          messages_per_round: number
          min_delay_seconds: number
          name: string
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          schedule: Json | null
          topics: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          chip_a_id?: string | null
          chip_b_id?: string | null
          created_at?: string
          daily_limit?: number
          enable_calls?: boolean | null
          id?: string
          is_active?: boolean
          max_delay_seconds?: number
          messages_per_round?: number
          min_delay_seconds?: number
          name: string
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          schedule?: Json | null
          topics?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          chip_a_id?: string | null
          chip_b_id?: string | null
          created_at?: string
          daily_limit?: number
          enable_calls?: boolean | null
          id?: string
          is_active?: boolean
          max_delay_seconds?: number
          messages_per_round?: number
          min_delay_seconds?: number
          name?: string
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          schedule?: Json | null
          topics?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "maturador_conversations_chip_a_id_fkey"
            columns: ["chip_a_id"]
            isOneToOne: false
            referencedRelation: "maturador_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maturador_conversations_chip_b_id_fkey"
            columns: ["chip_b_id"]
            isOneToOne: false
            referencedRelation: "maturador_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      maturador_instances: {
        Row: {
          api_provider: string | null
          conversation_count: number | null
          created_at: string
          evolution_api_key: string | null
          evolution_base_url: string | null
          id: string
          instance_name: string
          label: string | null
          last_conversation_sync: string | null
          last_error_at: string | null
          last_seen: string | null
          persona_id: string | null
          phone_number: string | null
          qrcode: string | null
          status: string
          uazapi_token: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          api_provider?: string | null
          conversation_count?: number | null
          created_at?: string
          evolution_api_key?: string | null
          evolution_base_url?: string | null
          id?: string
          instance_name: string
          label?: string | null
          last_conversation_sync?: string | null
          last_error_at?: string | null
          last_seen?: string | null
          persona_id?: string | null
          phone_number?: string | null
          qrcode?: string | null
          status?: string
          uazapi_token?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          api_provider?: string | null
          conversation_count?: number | null
          created_at?: string
          evolution_api_key?: string | null
          evolution_base_url?: string | null
          id?: string
          instance_name?: string
          label?: string | null
          last_conversation_sync?: string | null
          last_error_at?: string | null
          last_seen?: string | null
          persona_id?: string | null
          phone_number?: string | null
          qrcode?: string | null
          status?: string
          uazapi_token?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "maturador_instances_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "maturador_personas"
            referencedColumns: ["id"]
          },
        ]
      }
      maturador_messages: {
        Row: {
          body: string
          conversation_id: string | null
          created_at: string
          from_instance_id: string | null
          id: string
          message_type: string | null
          status: string
          to_instance_id: string | null
          user_id: string
        }
        Insert: {
          body: string
          conversation_id?: string | null
          created_at?: string
          from_instance_id?: string | null
          id?: string
          message_type?: string | null
          status?: string
          to_instance_id?: string | null
          user_id: string
        }
        Update: {
          body?: string
          conversation_id?: string | null
          created_at?: string
          from_instance_id?: string | null
          id?: string
          message_type?: string | null
          status?: string
          to_instance_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "maturador_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "maturador_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maturador_messages_from_instance_id_fkey"
            columns: ["from_instance_id"]
            isOneToOne: false
            referencedRelation: "maturador_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maturador_messages_to_instance_id_fkey"
            columns: ["to_instance_id"]
            isOneToOne: false
            referencedRelation: "maturador_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      maturador_personas: {
        Row: {
          created_at: string
          greeting_afternoon: string | null
          greeting_evening: string | null
          greeting_morning: string | null
          id: string
          message_templates: Json | null
          name: string
          style: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          greeting_afternoon?: string | null
          greeting_evening?: string | null
          greeting_morning?: string | null
          id?: string
          message_templates?: Json | null
          name: string
          style?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          greeting_afternoon?: string | null
          greeting_evening?: string | null
          greeting_morning?: string | null
          id?: string
          message_templates?: Json | null
          name?: string
          style?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      maturador_verified_contacts: {
        Row: {
          created_at: string
          id: string
          is_verified: boolean
          last_fetched_at: string | null
          name: string | null
          phone: string
          profile_pic_url: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_verified?: boolean
          last_fetched_at?: string | null
          name?: string | null
          phone: string
          profile_pic_url?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_verified?: boolean
          last_fetched_at?: string | null
          name?: string | null
          phone?: string
          profile_pic_url?: string | null
          updated_at?: string
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
      payment_notifications: {
        Row: {
          amount: number
          bank_type: string
          created_at: string
          id: string
          notification_sent: boolean | null
          payer_name: string | null
          raw_payload: Json | null
          user_id: string
          webhook_id: string
        }
        Insert: {
          amount: number
          bank_type: string
          created_at?: string
          id?: string
          notification_sent?: boolean | null
          payer_name?: string | null
          raw_payload?: Json | null
          user_id: string
          webhook_id: string
        }
        Update: {
          amount?: number
          bank_type?: string
          created_at?: string
          id?: string
          notification_sent?: boolean | null
          payer_name?: string | null
          raw_payload?: Json | null
          user_id?: string
          webhook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_notifications_webhook_id_fkey"
            columns: ["webhook_id"]
            isOneToOne: false
            referencedRelation: "user_payment_webhooks"
            referencedColumns: ["id"]
          },
        ]
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
          avatar_url: string | null
          created_at: string
          id: string
          is_full_member: boolean
          push_subscription_ids: string[] | null
          push_webhook_enabled: boolean | null
          push_webhook_url: string | null
          username: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          id: string
          is_full_member?: boolean
          push_subscription_ids?: string[] | null
          push_webhook_enabled?: boolean | null
          push_webhook_url?: string | null
          username: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          id?: string
          is_full_member?: boolean
          push_subscription_ids?: string[] | null
          push_webhook_enabled?: boolean | null
          push_webhook_url?: string | null
          username?: string
        }
        Relationships: []
      }
      proxy_gateway_config: {
        Row: {
          created_at: string | null
          description: string | null
          gateway_host: string
          gateway_pattern: string
          gateway_port: string
          id: string
          plan_type: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          gateway_host: string
          gateway_pattern: string
          gateway_port?: string
          id?: string
          plan_type: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          gateway_host?: string
          gateway_pattern?: string
          gateway_port?: string
          id?: string
          plan_type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      proxy_logs: {
        Row: {
          action: string
          api_response: Json | null
          created_at: string
          id: string
          message: string | null
          order_id: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          action: string
          api_response?: Json | null
          created_at?: string
          id?: string
          message?: string | null
          order_id?: string | null
          status: string
          user_id?: string | null
        }
        Update: {
          action?: string
          api_response?: Json | null
          created_at?: string
          id?: string
          message?: string | null
          order_id?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proxy_logs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "proxy_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      proxy_orders: {
        Row: {
          country: string | null
          created_at: string
          expires_at: string | null
          gateway_used: string | null
          host: string | null
          id: string
          label: string | null
          password: string | null
          plan_type: string | null
          port: string | null
          pyproxy_subuser_id: string | null
          status: string
          test_ip: string | null
          test_result: string | null
          updated_at: string
          user_id: string
          username: string | null
        }
        Insert: {
          country?: string | null
          created_at?: string
          expires_at?: string | null
          gateway_used?: string | null
          host?: string | null
          id?: string
          label?: string | null
          password?: string | null
          plan_type?: string | null
          port?: string | null
          pyproxy_subuser_id?: string | null
          status?: string
          test_ip?: string | null
          test_result?: string | null
          updated_at?: string
          user_id: string
          username?: string | null
        }
        Update: {
          country?: string | null
          created_at?: string
          expires_at?: string | null
          gateway_used?: string | null
          host?: string | null
          id?: string
          label?: string | null
          password?: string | null
          plan_type?: string | null
          port?: string | null
          pyproxy_subuser_id?: string | null
          status?: string
          test_ip?: string | null
          test_result?: string | null
          updated_at?: string
          user_id?: string
          username?: string | null
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
      tag_whats_configs: {
        Row: {
          ad_account_id: string | null
          created_at: string
          enable_conversion_tracking: boolean | null
          filter_images: boolean
          filter_pdfs: boolean
          id: string
          instance_id: string
          is_active: boolean
          pago_label_id: string | null
          pixel_id: string | null
          selected_ad_account_ids: string[] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ad_account_id?: string | null
          created_at?: string
          enable_conversion_tracking?: boolean | null
          filter_images?: boolean
          filter_pdfs?: boolean
          id?: string
          instance_id: string
          is_active?: boolean
          pago_label_id?: string | null
          pixel_id?: string | null
          selected_ad_account_ids?: string[] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ad_account_id?: string | null
          created_at?: string
          enable_conversion_tracking?: boolean | null
          filter_images?: boolean
          filter_pdfs?: boolean
          id?: string
          instance_id?: string
          is_active?: boolean
          pago_label_id?: string | null
          pixel_id?: string | null
          selected_ad_account_ids?: string[] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tag_whats_configs_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "maturador_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      tag_whats_daily_sales: {
        Row: {
          created_at: string | null
          id: string
          last_milestone_notified: number | null
          sales_count: number | null
          sales_date: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          last_milestone_notified?: number | null
          sales_count?: number | null
          sales_date?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          last_milestone_notified?: number | null
          sales_count?: number | null
          sales_date?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      tag_whats_logs: {
        Row: {
          ai_response: Json | null
          config_id: string
          contact_phone: string
          conversion_error: string | null
          conversion_event_id: string | null
          conversion_sent: boolean | null
          created_at: string
          ctwa_clid: string | null
          error_message: string | null
          extracted_value: number | null
          id: string
          instance_id: string
          is_pix_payment: boolean
          label_applied: boolean
          message_type: string
          user_id: string
        }
        Insert: {
          ai_response?: Json | null
          config_id: string
          contact_phone: string
          conversion_error?: string | null
          conversion_event_id?: string | null
          conversion_sent?: boolean | null
          created_at?: string
          ctwa_clid?: string | null
          error_message?: string | null
          extracted_value?: number | null
          id?: string
          instance_id: string
          is_pix_payment?: boolean
          label_applied?: boolean
          message_type: string
          user_id: string
        }
        Update: {
          ai_response?: Json | null
          config_id?: string
          contact_phone?: string
          conversion_error?: string | null
          conversion_event_id?: string | null
          conversion_sent?: boolean | null
          created_at?: string
          ctwa_clid?: string | null
          error_message?: string | null
          extracted_value?: number | null
          id?: string
          instance_id?: string
          is_pix_payment?: boolean
          label_applied?: boolean
          message_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tag_whats_logs_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "tag_whats_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_whats_logs_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "maturador_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      tag_whats_notification_preferences: {
        Row: {
          created_at: string | null
          custom_sound_url: string | null
          device_type: string | null
          dinheiro_conta: boolean | null
          fun_notifications_enabled: boolean | null
          id: string
          is_enabled: boolean | null
          nova_venda: boolean | null
          onesignal_player_id: string | null
          pingou: boolean | null
          pix_bolso: boolean | null
          pix_confirmado: boolean | null
          pix_recebido: boolean | null
          pix_x1: boolean | null
          updated_at: string | null
          user_id: string
          venda_aprovada: boolean | null
          venda_confirmada: boolean | null
          venda_paga: boolean | null
          venda_x1: boolean | null
        }
        Insert: {
          created_at?: string | null
          custom_sound_url?: string | null
          device_type?: string | null
          dinheiro_conta?: boolean | null
          fun_notifications_enabled?: boolean | null
          id?: string
          is_enabled?: boolean | null
          nova_venda?: boolean | null
          onesignal_player_id?: string | null
          pingou?: boolean | null
          pix_bolso?: boolean | null
          pix_confirmado?: boolean | null
          pix_recebido?: boolean | null
          pix_x1?: boolean | null
          updated_at?: string | null
          user_id: string
          venda_aprovada?: boolean | null
          venda_confirmada?: boolean | null
          venda_paga?: boolean | null
          venda_x1?: boolean | null
        }
        Update: {
          created_at?: string | null
          custom_sound_url?: string | null
          device_type?: string | null
          dinheiro_conta?: boolean | null
          fun_notifications_enabled?: boolean | null
          id?: string
          is_enabled?: boolean | null
          nova_venda?: boolean | null
          onesignal_player_id?: string | null
          pingou?: boolean | null
          pix_bolso?: boolean | null
          pix_confirmado?: boolean | null
          pix_recebido?: boolean | null
          pix_x1?: boolean | null
          updated_at?: string | null
          user_id?: string
          venda_aprovada?: boolean | null
          venda_confirmada?: boolean | null
          venda_paga?: boolean | null
          venda_x1?: boolean | null
        }
        Relationships: []
      }
      tag_whats_notification_rotation: {
        Row: {
          current_index: number | null
          id: string
          notification_type: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          current_index?: number | null
          id?: string
          notification_type: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          current_index?: number | null
          id?: string
          notification_type?: string
          updated_at?: string | null
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
      user_payment_webhooks: {
        Row: {
          bank_type: string
          created_at: string
          id: string
          is_active: boolean | null
          notifications_count: number | null
          total_received: number | null
          updated_at: string
          user_id: string
          webhook_id: string
        }
        Insert: {
          bank_type: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          notifications_count?: number | null
          total_received?: number | null
          updated_at?: string
          user_id: string
          webhook_id: string
        }
        Update: {
          bank_type?: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          notifications_count?: number | null
          total_received?: number | null
          updated_at?: string
          user_id?: string
          webhook_id?: string
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
          is_subtitled: boolean
          original_video_url: string | null
          render_id: string
          status: string
          subtitled_video_url: string | null
          updated_at: string
          user_id: string
          variation_name: string
          video_url: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_subtitled?: boolean
          original_video_url?: string | null
          render_id: string
          status?: string
          subtitled_video_url?: string | null
          updated_at?: string
          user_id: string
          variation_name: string
          video_url?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_subtitled?: boolean
          original_video_url?: string | null
          render_id?: string
          status?: string
          subtitled_video_url?: string | null
          updated_at?: string
          user_id?: string
          variation_name?: string
          video_url?: string | null
        }
        Relationships: []
      }
      video_prompts: {
        Row: {
          ai_model: string | null
          category: string
          created_at: string
          created_by: string | null
          id: string
          is_featured: boolean
          is_hidden: boolean
          preview_thumbnail: string | null
          preview_url: string | null
          prompt_text: string
          source: string
          tags: string[] | null
          title: string
          uses_count: number
        }
        Insert: {
          ai_model?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_featured?: boolean
          is_hidden?: boolean
          preview_thumbnail?: string | null
          preview_url?: string | null
          prompt_text: string
          source?: string
          tags?: string[] | null
          title: string
          uses_count?: number
        }
        Update: {
          ai_model?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_featured?: boolean
          is_hidden?: boolean
          preview_thumbnail?: string | null
          preview_url?: string | null
          prompt_text?: string
          source?: string
          tags?: string[] | null
          title?: string
          uses_count?: number
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
      webhook_diagnostics: {
        Row: {
          event_type: string
          id: string
          instance_id: string | null
          instance_name: string
          payload_preview: string | null
          received_at: string | null
          user_id: string | null
        }
        Insert: {
          event_type: string
          id?: string
          instance_id?: string | null
          instance_name: string
          payload_preview?: string | null
          received_at?: string | null
          user_id?: string | null
        }
        Update: {
          event_type?: string
          id?: string
          instance_id?: string | null
          instance_name?: string
          payload_preview?: string | null
          received_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webhook_diagnostics_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "maturador_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_failed_messages: {
        Row: {
          created_at: string
          discard_reason: string
          event_type: string
          id: string
          instance_name: string
          payload: Json
          phone_extracted: string | null
          remote_jid: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          discard_reason: string
          event_type: string
          id?: string
          instance_name: string
          payload: Json
          phone_extracted?: string | null
          remote_jid?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          discard_reason?: string
          event_type?: string
          id?: string
          instance_name?: string
          payload?: Json
          phone_extracted?: string | null
          remote_jid?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      webhook_history: {
        Row: {
          created_at: string | null
          email: string
          error_message: string | null
          id: string
          payload: Json | null
          status: string
          transaction_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          error_message?: string | null
          id?: string
          payload?: Json | null
          status?: string
          transaction_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          error_message?: string | null
          id?: string
          payload?: Json | null
          status?: string
          transaction_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      whatsapp_api_config: {
        Row: {
          active_provider: string
          evolution_api_key: string | null
          evolution_base_url: string | null
          id: string
          uazapi_admin_header: string | null
          uazapi_api_prefix: string | null
          uazapi_api_token: string | null
          uazapi_base_url: string | null
          uazapi_list_instances_method: string | null
          uazapi_list_instances_path: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          active_provider?: string
          evolution_api_key?: string | null
          evolution_base_url?: string | null
          id?: string
          uazapi_admin_header?: string | null
          uazapi_api_prefix?: string | null
          uazapi_api_token?: string | null
          uazapi_base_url?: string | null
          uazapi_list_instances_method?: string | null
          uazapi_list_instances_path?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          active_provider?: string
          evolution_api_key?: string | null
          evolution_base_url?: string | null
          id?: string
          uazapi_admin_header?: string | null
          uazapi_api_prefix?: string | null
          uazapi_api_token?: string | null
          uazapi_base_url?: string | null
          uazapi_list_instances_method?: string | null
          uazapi_list_instances_path?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      whatsapp_charges: {
        Row: {
          charge_code: string
          created_at: string
          delivered_at: string | null
          id: string
          instance_id: string | null
          items: Json
          notes: string | null
          paid_at: string | null
          pix_copy_paste: string | null
          pix_qr_code: string | null
          recipient_name: string | null
          recipient_phone: string
          sent_at: string | null
          status: string
          total_amount: number
          updated_at: string
          user_id: string
        }
        Insert: {
          charge_code: string
          created_at?: string
          delivered_at?: string | null
          id?: string
          instance_id?: string | null
          items?: Json
          notes?: string | null
          paid_at?: string | null
          pix_copy_paste?: string | null
          pix_qr_code?: string | null
          recipient_name?: string | null
          recipient_phone: string
          sent_at?: string | null
          status?: string
          total_amount?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          charge_code?: string
          created_at?: string
          delivered_at?: string | null
          id?: string
          instance_id?: string | null
          items?: Json
          notes?: string | null
          paid_at?: string | null
          pix_copy_paste?: string | null
          pix_qr_code?: string | null
          recipient_name?: string | null
          recipient_phone?: string
          sent_at?: string | null
          status?: string
          total_amount?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_charges_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "maturador_instances"
            referencedColumns: ["id"]
          },
        ]
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
      cleanup_old_data: { Args: never; Returns: undefined }
      cleanup_old_webhook_diagnostics: { Args: never; Returns: undefined }
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
