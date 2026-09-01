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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      admin_actions: {
        Row: {
          action_type: string
          admin_id: string
          created_at: string
          id: string
          notes: string
          target_room_id: string | null
          target_user_id: string | null
        }
        Insert: {
          action_type: string
          admin_id: string
          created_at?: string
          id?: string
          notes: string
          target_room_id?: string | null
          target_user_id?: string | null
        }
        Update: {
          action_type?: string
          admin_id?: string
          created_at?: string
          id?: string
          notes?: string
          target_room_id?: string | null
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_actions_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_actions_target_room_id_fkey"
            columns: ["target_room_id"]
            isOneToOne: false
            referencedRelation: "chat_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_actions_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      app_notifications: {
        Row: {
          actor_id: string | null
          body: string
          created_at: string
          href: string
          id: string
          metadata: Json
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          actor_id?: string | null
          body?: string
          created_at?: string
          href?: string
          id?: string
          metadata?: Json
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          actor_id?: string | null
          body?: string
          created_at?: string
          href?: string
          id?: string
          metadata?: Json
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      block_events: {
        Row: {
          blocked_device_hash: string | null
          blocked_id: string
          blocker_id: string
          created_at: string
          id: string
        }
        Insert: {
          blocked_device_hash?: string | null
          blocked_id: string
          blocker_id: string
          created_at?: string
          id?: string
        }
        Update: {
          blocked_device_hash?: string | null
          blocked_id?: string
          blocker_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "block_events_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "block_events_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      calls: {
        Row: {
          agora_channel_name: string | null
          billed_minutes: number
          call_type: string
          caller_id: string
          coins_charged: number
          created_at: string
          duration_seconds: number
          ended_at: string | null
          id: string
          rate_per_minute: number
          receiver_id: string
          room_id: string
          started_at: string | null
          status: string
        }
        Insert: {
          agora_channel_name?: string | null
          billed_minutes?: number
          call_type: string
          caller_id: string
          coins_charged?: number
          created_at?: string
          duration_seconds?: number
          ended_at?: string | null
          id?: string
          rate_per_minute: number
          receiver_id: string
          room_id: string
          started_at?: string | null
          status?: string
        }
        Update: {
          agora_channel_name?: string | null
          billed_minutes?: number
          call_type?: string
          caller_id?: string
          coins_charged?: number
          created_at?: string
          duration_seconds?: number
          ended_at?: string | null
          id?: string
          rate_per_minute?: number
          receiver_id?: string
          room_id?: string
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "calls_caller_id_fkey"
            columns: ["caller_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "chat_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_rooms: {
        Row: {
          created_at: string
          id: string
          is_paywalled: boolean
          last_message_at: string
          message_count: number
          room_type: string
          status: string
          user_a: string
          user_b: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_paywalled?: boolean
          last_message_at?: string
          message_count?: number
          room_type?: string
          status?: string
          user_a: string
          user_b: string
        }
        Update: {
          created_at?: string
          id?: string
          is_paywalled?: boolean
          last_message_at?: string
          message_count?: number
          room_type?: string
          status?: string
          user_a?: string
          user_b?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_rooms_user_a_fkey"
            columns: ["user_a"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_rooms_user_b_fkey"
            columns: ["user_b"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      device_bans: {
        Row: {
          banned_at: string
          block_count: number
          blocked_user_id: string | null
          device_hash: string
          reason: string
        }
        Insert: {
          banned_at?: string
          block_count?: number
          blocked_user_id?: string | null
          device_hash: string
          reason?: string
        }
        Update: {
          banned_at?: string
          block_count?: number
          blocked_user_id?: string | null
          device_hash?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_bans_blocked_user_id_fkey"
            columns: ["blocked_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      favorites: {
        Row: {
          created_at: string
          favorite_user_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          favorite_user_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          favorite_user_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_favorite_user_id_fkey"
            columns: ["favorite_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          cloudinary_public_id: string | null
          cloudinary_resource_type: string | null
          cloudinary_url: string | null
          coins_charged: number
          content: string | null
          created_at: string
          delivered_at: string | null
          expires_at: string
          id: string
          is_paid: boolean
          message_type: string
          read_at: string | null
          room_id: string
          sender_id: string
        }
        Insert: {
          cloudinary_public_id?: string | null
          cloudinary_resource_type?: string | null
          cloudinary_url?: string | null
          coins_charged?: number
          content?: string | null
          created_at?: string
          delivered_at?: string | null
          expires_at?: string
          id?: string
          is_paid?: boolean
          message_type?: string
          read_at?: string | null
          room_id: string
          sender_id: string
        }
        Update: {
          cloudinary_public_id?: string | null
          cloudinary_resource_type?: string | null
          cloudinary_url?: string | null
          coins_charged?: number
          content?: string | null
          created_at?: string
          delivered_at?: string | null
          expires_at?: string
          id?: string
          is_paid?: boolean
          message_type?: string
          read_at?: string | null
          room_id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "chat_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_intents: {
        Row: {
          amount_inr: number
          coins_requested: number
          completed_at: string | null
          created_at: string
          gateway: string
          id: string
          status: string
          user_id: string
        }
        Insert: {
          amount_inr: number
          coins_requested: number
          completed_at?: string | null
          created_at?: string
          gateway?: string
          id?: string
          status?: string
          user_id: string
        }
        Update: {
          amount_inr?: number
          coins_requested?: number
          completed_at?: string | null
          created_at?: string
          gateway?: string
          id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_intents_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_config: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      host_requests: {
        Row: {
          admin_id: string | null
          admin_notes: string | null
          created_at: string
          id: string
          note: string
          phone: string
          reviewed_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_id?: string | null
          admin_notes?: string | null
          created_at?: string
          id?: string
          note?: string
          phone: string
          reviewed_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_id?: string | null
          admin_notes?: string | null
          created_at?: string
          id?: string
          note?: string
          phone?: string
          reviewed_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "host_requests_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "host_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_media: {
        Row: {
          cloudinary_public_id: string
          cloudinary_url: string
          created_at: string
          id: string
          is_primary: boolean
          media_type: string
          position: number
          user_id: string
        }
        Insert: {
          cloudinary_public_id: string
          cloudinary_url: string
          created_at?: string
          id?: string
          is_primary?: boolean
          media_type: string
          position: number
          user_id: string
        }
        Update: {
          cloudinary_public_id?: string
          cloudinary_url?: string
          created_at?: string
          id?: string
          is_primary?: boolean
          media_type?: string
          position?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_media_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          age: number | null
          audio_call_rate_coins: number
          bio: string
          chat_rate_coins: number
          free_chat_enabled: boolean
          languages: string[]
          location: string | null
          min_topup_required: boolean
          real_meet_available: boolean
          tags: string[]
          updated_at: string
          user_id: string
          video_call_rate_coins: number
        }
        Insert: {
          age?: number | null
          audio_call_rate_coins?: number
          bio?: string
          chat_rate_coins?: number
          free_chat_enabled?: boolean
          languages?: string[]
          location?: string | null
          min_topup_required?: boolean
          real_meet_available?: boolean
          tags?: string[]
          updated_at?: string
          user_id: string
          video_call_rate_coins?: number
        }
        Update: {
          age?: number | null
          audio_call_rate_coins?: number
          bio?: string
          chat_rate_coins?: number
          free_chat_enabled?: boolean
          languages?: string[]
          location?: string | null
          min_topup_required?: boolean
          real_meet_available?: boolean
          tags?: string[]
          updated_at?: string
          user_id?: string
          video_call_rate_coins?: number
        }
        Relationships: [
          {
            foreignKeyName: "profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      push_tokens: {
        Row: {
          created_at: string
          device_hash: string | null
          enabled: boolean
          last_seen_at: string
          platform: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_hash?: string | null
          enabled?: boolean
          last_seen_at?: string
          platform?: string
          token: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_hash?: string | null
          enabled?: boolean
          last_seen_at?: string
          platform?: string
          token?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      random_chat_queue: {
        Row: {
          id: string
          joined_at: string
          matched_room_id: string | null
          status: string
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          matched_room_id?: string | null
          status?: string
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          matched_room_id?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "random_chat_queue_matched_room_id_fkey"
            columns: ["matched_room_id"]
            isOneToOne: false
            referencedRelation: "chat_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "random_chat_queue_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ratings: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          rated_user_id: string
          rater_id: string
          room_id: string
          score: number
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          rated_user_id: string
          rater_id: string
          room_id: string
          score: number
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          rated_user_id?: string
          rater_id?: string
          room_id?: string
          score?: number
        }
        Relationships: [
          {
            foreignKeyName: "ratings_rated_user_id_fkey"
            columns: ["rated_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ratings_rater_id_fkey"
            columns: ["rater_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ratings_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "chat_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          admin_id: string | null
          admin_notes: string | null
          created_at: string
          id: string
          reason: string
          related_rating_id: string | null
          reported_user_id: string
          reporter_id: string
          resolved_at: string | null
          room_id: string | null
          status: string
        }
        Insert: {
          admin_id?: string | null
          admin_notes?: string | null
          created_at?: string
          id?: string
          reason: string
          related_rating_id?: string | null
          reported_user_id: string
          reporter_id: string
          resolved_at?: string | null
          room_id?: string | null
          status?: string
        }
        Update: {
          admin_id?: string | null
          admin_notes?: string | null
          created_at?: string
          id?: string
          reason?: string
          related_rating_id?: string | null
          reported_user_id?: string
          reporter_id?: string
          resolved_at?: string | null
          room_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reported_user_id_fkey"
            columns: ["reported_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "chat_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          display_name: string
          gender: string | null
          id: string
          is_banned: boolean
          is_guest: boolean
          is_verified: boolean
          last_seen: string
          role: string
          status: string
          updated_at: string
          username: string
        }
        Insert: {
          created_at?: string
          display_name: string
          gender?: string | null
          id: string
          is_banned?: boolean
          is_guest?: boolean
          is_verified?: boolean
          last_seen?: string
          role?: string
          status?: string
          updated_at?: string
          username: string
        }
        Update: {
          created_at?: string
          display_name?: string
          gender?: string | null
          id?: string
          is_banned?: boolean
          is_guest?: boolean
          is_verified?: boolean
          last_seen?: string
          role?: string
          status?: string
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      user_devices: {
        Row: {
          device_hash: string
          first_seen_at: string
          last_seen_at: string
          user_id: string
        }
        Insert: {
          device_hash: string
          first_seen_at?: string
          last_seen_at?: string
          user_id: string
        }
        Update: {
          device_hash?: string
          first_seen_at?: string
          last_seen_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_devices_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      visitor_sessions: {
        Row: {
          device_hash: string | null
          first_seen_at: string
          last_seen_at: string
          path: string
          presence: string
          session_id: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          device_hash?: string | null
          first_seen_at?: string
          last_seen_at?: string
          path?: string
          presence?: string
          session_id: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          device_hash?: string | null
          first_seen_at?: string
          last_seen_at?: string
          path?: string
          presence?: string
          session_id?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "visitor_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_transactions: {
        Row: {
          amount: number
          balance_after: number
          created_at: string
          currency: string
          id: string
          idempotency_key: string | null
          payment_gateway_ref: string | null
          related_call_id: string | null
          related_chat_id: string | null
          related_message_id: string | null
          status: string
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          balance_after: number
          created_at?: string
          currency: string
          id?: string
          idempotency_key?: string | null
          payment_gateway_ref?: string | null
          related_call_id?: string | null
          related_chat_id?: string | null
          related_message_id?: string | null
          status?: string
          type: string
          user_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string
          currency?: string
          id?: string
          idempotency_key?: string | null
          payment_gateway_ref?: string | null
          related_call_id?: string | null
          related_chat_id?: string | null
          related_message_id?: string | null
          status?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_transactions_related_call_id_fkey"
            columns: ["related_call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_transactions_related_chat_id_fkey"
            columns: ["related_chat_id"]
            isOneToOne: false
            referencedRelation: "chat_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_transactions_related_message_id_fkey"
            columns: ["related_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      wallets: {
        Row: {
          beans_balance: number
          coins_balance: number
          lifetime_beans_earned: number
          lifetime_beans_withdrawn: number
          lifetime_coins_purchased: number
          updated_at: string
          user_id: string
        }
        Insert: {
          beans_balance?: number
          coins_balance?: number
          lifetime_beans_earned?: number
          lifetime_beans_withdrawn?: number
          lifetime_coins_purchased?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          beans_balance?: number
          coins_balance?: number
          lifetime_beans_earned?: number
          lifetime_beans_withdrawn?: number
          lifetime_coins_purchased?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      withdrawal_requests: {
        Row: {
          admin_id: string | null
          beans_requested: number
          created_at: string
          id: string
          inr_amount: number
          payout_account_holder: string | null
          payout_bank_account: string | null
          payout_ifsc: string | null
          payout_method: string
          payout_upi_id: string | null
          processed_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          admin_id?: string | null
          beans_requested: number
          created_at?: string
          id?: string
          inr_amount: number
          payout_account_holder?: string | null
          payout_bank_account?: string | null
          payout_ifsc?: string | null
          payout_method?: string
          payout_upi_id?: string | null
          processed_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          admin_id?: string | null
          beans_requested?: number
          created_at?: string
          id?: string
          inr_amount?: number
          payout_account_holder?: string | null
          payout_bank_account?: string | null
          payout_ifsc?: string | null
          payout_method?: string
          payout_upi_id?: string | null
          processed_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "withdrawal_requests_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "withdrawal_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_adjust_wallet: {
        Args: {
          p_amount: number
          p_currency: string
          p_notes: string
          p_target_user: string
        }
        Returns: number
      }
      admin_review_report: {
        Args: { p_notes: string; p_report_id: string; p_status: string }
        Returns: undefined
      }
      admin_review_host_request: {
        Args: { p_approve: boolean; p_notes?: string; p_request_id: string }
        Returns: undefined
      }
      admin_review_withdrawal: {
        Args: { p_approve: boolean; p_notes: string; p_request_id: string }
        Returns: undefined
      }
      admin_set_user_ban: {
        Args: { p_banned: boolean; p_notes: string; p_target_user: string }
        Returns: undefined
      }
      admin_set_user_verification: {
        Args: { p_notes?: string; p_target_user: string; p_verified: boolean }
        Returns: undefined
      }
      admin_update_platform_config: {
        Args: { p_key: string; p_notes?: string; p_value: number }
        Returns: undefined
      }
      cancel_random_chat: { Args: never; Returns: undefined }
      charge_call_minute: { Args: { p_call_id: string }; Returns: boolean }
      block_user: {
        Args: { p_blocked_user: string; p_device_id?: string }
        Returns: {
          blocked_id: string
          blocker_id: string
          created_at: string
        }
      }
      complete_dummy_payment: { Args: { p_intent_id: string }; Returns: number }
      create_or_get_direct_room: {
        Args: { p_target_user: string }
        Returns: string
      }
      create_payment_intent: {
        Args: { p_amount_inr?: number | null; p_coins: number }
        Returns: string
      }
      disconnect_random_chat: { Args: { p_room_id: string }; Returns: undefined }
      end_call: { Args: { p_call_id: string }; Returns: undefined }
      get_room_block_state: {
        Args: { p_room_id: string }
        Returns: {
          other_blocked_viewer: boolean
          viewer_blocked_other: boolean
        }[]
      }
      hash_device_id: { Args: { p_device_id: string }; Returns: string }
      is_admin: { Args: never; Returns: boolean }
      is_device_banned: { Args: { p_device_id: string }; Returns: boolean }
      mark_notifications_read: {
        Args: { p_notification_ids?: string[] | null }
        Returns: number
      }
      mark_room_delivered: { Args: { p_room_id: string }; Returns: number }
      mark_room_read: { Args: { p_room_id: string }; Returns: number }
      match_random_chat: { Args: { p_reset?: boolean }; Returns: string | null }
      register_device: { Args: { p_device_id: string }; Returns: boolean }
      register_push_token: {
        Args: { p_device_id?: string | null; p_platform?: string; p_token: string }
        Returns: boolean
      }
      report_user: {
        Args: { p_reason: string; p_reported_user: string; p_room_id: string }
        Returns: string
      }
      report_host_review: {
        Args: { p_rating_id: string; p_reason: string }
        Returns: string
      }
      refresh_stale_presence: { Args: never; Returns: number }
      request_withdrawal: {
        Args: {
          p_account_holder?: string | null
          p_bank_account?: string | null
          p_beans: number
          p_ifsc?: string | null
          p_payout_method?: string
          p_upi_id?: string | null
        }
        Returns: string
      }
      respond_to_call: {
        Args: { p_accept: boolean; p_call_id: string }
        Returns: boolean
      }
      send_tip: {
        Args: { p_amount: number; p_call_id?: string | null; p_room_id: string }
        Returns: number
      }
      submit_host_review: {
        Args: { p_comment?: string | null; p_rated_user: string; p_score: number }
        Returns: string
      }
      submit_host_request: {
        Args: { p_note?: string; p_phone: string }
        Returns: string
      }
      track_visitor_session: {
        Args: {
          p_device_id?: string | null
          p_path?: string
          p_presence?: string
          p_session_id: string
          p_user_agent?: string | null
        }
        Returns: boolean
      }
      unblock_user: { Args: { p_blocked_user: string }; Returns: undefined }
      send_message: {
        Args: {
          p_cloudinary_public_id?: string
          p_cloudinary_resource_type?: string
          p_cloudinary_url?: string
          p_content?: string
          p_message_type: string
          p_room_id: string
        }
        Returns: {
          cloudinary_public_id: string | null
          cloudinary_resource_type: string | null
          cloudinary_url: string | null
          coins_charged: number
          content: string | null
          created_at: string
          delivered_at: string | null
          expires_at: string
          id: string
          is_paid: boolean
          message_type: string
          read_at: string | null
          room_id: string
          sender_id: string
        }
        SetofOptions: {
          from: "*"
          to: "messages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_expired_chat_messages_for_cleanup: {
        Args: { p_limit?: number; p_secret: string }
        Returns: {
          cloudinary_public_id: string | null
          cloudinary_resource_type: string | null
          id: string
          room_id: string
        }[]
      }
      delete_expired_chat_messages: {
        Args: { p_message_ids: string[]; p_secret: string }
        Returns: number
      }
      start_call: {
        Args: { p_call_type: string; p_room_id: string }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
