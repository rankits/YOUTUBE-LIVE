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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      agent_prompts: {
        Row: {
          agent_id: string
          created_at: string
          id: string
          system_instructions: string
          user_id: string
          version: number
        }
        Insert: {
          agent_id: string
          created_at?: string
          id?: string
          system_instructions: string
          user_id: string
          version?: number
        }
        Update: {
          agent_id?: string
          created_at?: string
          id?: string
          system_instructions?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "agent_prompts_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agents: {
        Row: {
          accent_color: string
          avatar_path: string | null
          background: string
          created_at: string
          creativity: number
          id: string
          knowledge_domain: string
          language: string
          model: string
          name: string
          personality: string
          preset_avatar: string | null
          response_style: string
          role: string
          speaking_speed: number
          system_instructions: string
          updated_at: string
          user_id: string
          voice_id: string
          voice_provider: string
        }
        Insert: {
          accent_color?: string
          avatar_path?: string | null
          background?: string
          created_at?: string
          creativity?: number
          id?: string
          knowledge_domain?: string
          language?: string
          model?: string
          name: string
          personality?: string
          preset_avatar?: string | null
          response_style?: string
          role?: string
          speaking_speed?: number
          system_instructions?: string
          updated_at?: string
          user_id: string
          voice_id?: string
          voice_provider?: string
        }
        Update: {
          accent_color?: string
          avatar_path?: string | null
          background?: string
          created_at?: string
          creativity?: number
          id?: string
          knowledge_domain?: string
          language?: string
          model?: string
          name?: string
          personality?: string
          preset_avatar?: string | null
          response_style?: string
          role?: string
          speaking_speed?: number
          system_instructions?: string
          updated_at?: string
          user_id?: string
          voice_id?: string
          voice_provider?: string
        }
        Relationships: []
      }
      broadcast_sessions: {
        Row: {
          approved_at: string | null
          approved_public: boolean
          created_at: string
          description: string
          ended_at: string | null
          error: string | null
          id: string
          ingestion_address: string | null
          interview_id: string | null
          privacy: string
          started_at: string | null
          status: string
          stream_status: string | null
          title: string
          updated_at: string
          user_id: string
          watch_url: string | null
          youtube_broadcast_id: string | null
          youtube_stream_id: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_public?: boolean
          created_at?: string
          description?: string
          ended_at?: string | null
          error?: string | null
          id?: string
          ingestion_address?: string | null
          interview_id?: string | null
          privacy?: string
          started_at?: string | null
          status?: string
          stream_status?: string | null
          title: string
          updated_at?: string
          user_id: string
          watch_url?: string | null
          youtube_broadcast_id?: string | null
          youtube_stream_id?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_public?: boolean
          created_at?: string
          description?: string
          ended_at?: string | null
          error?: string | null
          id?: string
          ingestion_address?: string | null
          interview_id?: string | null
          privacy?: string
          started_at?: string | null
          status?: string
          stream_status?: string | null
          title?: string
          updated_at?: string
          user_id?: string
          watch_url?: string | null
          youtube_broadcast_id?: string | null
          youtube_stream_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "broadcast_sessions_interview_id_fkey"
            columns: ["interview_id"]
            isOneToOne: false
            referencedRelation: "interviews"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_settings: {
        Row: {
          branding_text: string
          created_at: string
          daily_turn_limit: number
          id: string
          obs_fps: number
          obs_resolution: string
          show_branding: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          branding_text?: string
          created_at?: string
          daily_turn_limit?: number
          id?: string
          obs_fps?: number
          obs_resolution?: string
          show_branding?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          branding_text?: string
          created_at?: string
          daily_turn_limit?: number
          id?: string
          obs_fps?: number
          obs_resolution?: string
          show_branding?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      interview_messages: {
        Row: {
          agent_id: string | null
          audio_duration_ms: number | null
          audio_path: string | null
          completion_tokens: number
          content: string
          cost_credits: number
          created_at: string
          id: string
          interview_id: string
          key_point: string | null
          model: string | null
          prompt_tokens: number
          session_id: string | null
          speaker: string
          topic: string | null
          turn_index: number
          user_id: string
          visual: Json | null
        }
        Insert: {
          agent_id?: string | null
          audio_duration_ms?: number | null
          audio_path?: string | null
          completion_tokens?: number
          content: string
          cost_credits?: number
          created_at?: string
          id?: string
          interview_id: string
          key_point?: string | null
          model?: string | null
          prompt_tokens?: number
          session_id?: string | null
          speaker: string
          topic?: string | null
          turn_index: number
          user_id: string
          visual?: Json | null
        }
        Update: {
          agent_id?: string | null
          audio_duration_ms?: number | null
          audio_path?: string | null
          completion_tokens?: number
          content?: string
          cost_credits?: number
          created_at?: string
          id?: string
          interview_id?: string
          key_point?: string | null
          model?: string | null
          prompt_tokens?: number
          session_id?: string | null
          speaker?: string
          topic?: string | null
          turn_index?: number
          user_id?: string
          visual?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "interview_messages_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_messages_interview_id_fkey"
            columns: ["interview_id"]
            isOneToOne: false
            referencedRelation: "interviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "interview_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_questions: {
        Row: {
          answer: number
          created_at: string
          explanation: string
          id: string
          idx: number
          interview_id: string
          options: Json
          question: string
          short_publish_at: string | null
          short_url: string | null
          topic: string | null
          used: boolean
          user_id: string
        }
        Insert: {
          answer: number
          created_at?: string
          explanation?: string
          id?: string
          idx: number
          interview_id: string
          options: Json
          question: string
          short_publish_at?: string | null
          short_url?: string | null
          topic?: string | null
          used?: boolean
          user_id: string
        }
        Update: {
          answer?: number
          created_at?: string
          explanation?: string
          id?: string
          idx?: number
          interview_id?: string
          options?: Json
          question?: string
          short_publish_at?: string | null
          short_url?: string | null
          topic?: string | null
          used?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_questions_interview_id_fkey"
            columns: ["interview_id"]
            isOneToOne: false
            referencedRelation: "interviews"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_sessions: {
        Row: {
          ended_at: string | null
          error: string | null
          id: string
          interview_id: string
          started_at: string
          status: string
          turns: number
          user_id: string
        }
        Insert: {
          ended_at?: string | null
          error?: string | null
          id?: string
          interview_id: string
          started_at?: string
          status?: string
          turns?: number
          user_id: string
        }
        Update: {
          ended_at?: string | null
          error?: string | null
          id?: string
          interview_id?: string
          started_at?: string
          status?: string
          turns?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_sessions_interview_id_fkey"
            columns: ["interview_id"]
            isOneToOne: false
            referencedRelation: "interviews"
            referencedColumns: ["id"]
          },
        ]
      }
      interviews: {
        Row: {
          broadcast_token: string
          candidate_agent_id: string | null
          created_at: string
          custom_topic: string | null
          difficulty: string
          duration_minutes: number
          ended_at: string | null
          followup_frequency: string
          format: string
          id: string
          interview_style: string
          interviewer_agent_id: string | null
          key_points: Json
          language: string
          max_questions: number
          max_response_words: number
          speaking_speed: number
          started_at: string | null
          status: string
          summary: string | null
          temperature: number
          text_only: boolean
          title: string
          topic: string
          topic_depth: string
          topics: string[]
          turn_count: number
          updated_at: string
          user_id: string
          visuals: Json
          youtube_broadcast_url: string | null
        }
        Insert: {
          broadcast_token?: string
          candidate_agent_id?: string | null
          created_at?: string
          custom_topic?: string | null
          difficulty?: string
          duration_minutes?: number
          ended_at?: string | null
          followup_frequency?: string
          format?: string
          id?: string
          interview_style?: string
          interviewer_agent_id?: string | null
          key_points?: Json
          language?: string
          max_questions?: number
          max_response_words?: number
          speaking_speed?: number
          started_at?: string | null
          status?: string
          summary?: string | null
          temperature?: number
          text_only?: boolean
          title: string
          topic: string
          topic_depth?: string
          topics?: string[]
          turn_count?: number
          updated_at?: string
          user_id: string
          visuals?: Json
          youtube_broadcast_url?: string | null
        }
        Update: {
          broadcast_token?: string
          candidate_agent_id?: string | null
          created_at?: string
          custom_topic?: string | null
          difficulty?: string
          duration_minutes?: number
          ended_at?: string | null
          followup_frequency?: string
          format?: string
          id?: string
          interview_style?: string
          interviewer_agent_id?: string | null
          key_points?: Json
          language?: string
          max_questions?: number
          max_response_words?: number
          speaking_speed?: number
          started_at?: string | null
          status?: string
          summary?: string | null
          temperature?: number
          text_only?: boolean
          title?: string
          topic?: string
          topic_depth?: string
          topics?: string[]
          turn_count?: number
          updated_at?: string
          user_id?: string
          visuals?: Json
          youtube_broadcast_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "interviews_candidate_agent_id_fkey"
            columns: ["candidate_agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interviews_interviewer_agent_id_fkey"
            columns: ["interviewer_agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      oauth_states: {
        Row: {
          created_at: string
          redirect_uri: string
          return_to: string
          slot: number
          state: string
          user_id: string
        }
        Insert: {
          created_at?: string
          redirect_uri: string
          return_to?: string
          slot?: number
          state: string
          user_id: string
        }
        Update: {
          created_at?: string
          redirect_uri?: string
          return_to?: string
          slot?: number
          state?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          channel_name: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          channel_name?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          channel_name?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      provider_quota: {
        Row: {
          provider: string
          snapshot: Json
          updated_at: string
        }
        Insert: {
          provider: string
          snapshot?: Json
          updated_at?: string
        }
        Update: {
          provider?: string
          snapshot?: Json
          updated_at?: string
        }
        Relationships: []
      }
      recordings: {
        Row: {
          created_at: string
          duration_ms: number | null
          id: string
          interview_id: string | null
          kind: string
          mime_type: string
          size_bytes: number | null
          storage_path: string
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          id?: string
          interview_id?: string | null
          kind?: string
          mime_type: string
          size_bytes?: number | null
          storage_path: string
          user_id: string
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          id?: string
          interview_id?: string | null
          kind?: string
          mime_type?: string
          size_bytes?: number | null
          storage_path?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recordings_interview_id_fkey"
            columns: ["interview_id"]
            isOneToOne: false
            referencedRelation: "interviews"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_interviews: {
        Row: {
          approved: boolean
          auto_publish: boolean
          candidate_agent_id: string | null
          created_at: string
          duration_minutes: number
          format: string
          id: string
          interview_id: string | null
          interviewer_agent_id: string | null
          language: string
          privacy: string
          requires_approval: boolean
          scheduled_at: string
          status: string
          title: string
          topic: string
          updated_at: string
          user_id: string
          youtube_description: string | null
          youtube_title: string | null
        }
        Insert: {
          approved?: boolean
          auto_publish?: boolean
          candidate_agent_id?: string | null
          created_at?: string
          duration_minutes?: number
          format?: string
          id?: string
          interview_id?: string | null
          interviewer_agent_id?: string | null
          language?: string
          privacy?: string
          requires_approval?: boolean
          scheduled_at: string
          status?: string
          title: string
          topic: string
          updated_at?: string
          user_id: string
          youtube_description?: string | null
          youtube_title?: string | null
        }
        Update: {
          approved?: boolean
          auto_publish?: boolean
          candidate_agent_id?: string | null
          created_at?: string
          duration_minutes?: number
          format?: string
          id?: string
          interview_id?: string | null
          interviewer_agent_id?: string | null
          language?: string
          privacy?: string
          requires_approval?: boolean
          scheduled_at?: string
          status?: string
          title?: string
          topic?: string
          updated_at?: string
          user_id?: string
          youtube_description?: string | null
          youtube_title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_interviews_candidate_agent_id_fkey"
            columns: ["candidate_agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_interviews_interview_id_fkey"
            columns: ["interview_id"]
            isOneToOne: false
            referencedRelation: "interviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_interviews_interviewer_agent_id_fkey"
            columns: ["interviewer_agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_analytics: {
        Row: {
          agent_id: string | null
          audio_ms: number
          completion_tokens: number
          cost_credits: number
          created_at: string
          id: string
          interview_id: string | null
          kind: string
          model: string
          prompt_tokens: number
          user_id: string
        }
        Insert: {
          agent_id?: string | null
          audio_ms?: number
          completion_tokens?: number
          cost_credits?: number
          created_at?: string
          id?: string
          interview_id?: string | null
          kind: string
          model: string
          prompt_tokens?: number
          user_id: string
        }
        Update: {
          agent_id?: string | null
          audio_ms?: number
          completion_tokens?: number
          cost_credits?: number
          created_at?: string
          id?: string
          interview_id?: string | null
          kind?: string
          model?: string
          prompt_tokens?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_analytics_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_analytics_interview_id_fkey"
            columns: ["interview_id"]
            isOneToOne: false
            referencedRelation: "interviews"
            referencedColumns: ["id"]
          },
        ]
      }
      user_api_keys: {
        Row: {
          encrypted: Json
          prefs: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          encrypted?: Json
          prefs?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          encrypted?: Json
          prefs?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      voice_settings: {
        Row: {
          created_at: string
          default_speed: number
          id: string
          text_only_default: boolean
          updated_at: string
          user_id: string
          volume: number
        }
        Insert: {
          created_at?: string
          default_speed?: number
          id?: string
          text_only_default?: boolean
          updated_at?: string
          user_id: string
          volume?: number
        }
        Update: {
          created_at?: string
          default_speed?: number
          id?: string
          text_only_default?: boolean
          updated_at?: string
          user_id?: string
          volume?: number
        }
        Relationships: []
      }
      youtube_connections: {
        Row: {
          channel_id: string
          channel_thumbnail: string | null
          channel_title: string | null
          connected_at: string
          id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          channel_id: string
          channel_thumbnail?: string | null
          channel_title?: string | null
          connected_at?: string
          id?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          channel_id?: string
          channel_thumbnail?: string | null
          channel_title?: string | null
          connected_at?: string
          id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      youtube_slot_tokens: {
        Row: {
          access_expires_at: string | null
          encrypted_access_token: string | null
          encrypted_refresh_token: string
          slot: number
          updated_at: string
          user_id: string
        }
        Insert: {
          access_expires_at?: string | null
          encrypted_access_token?: string | null
          encrypted_refresh_token: string
          slot: number
          updated_at?: string
          user_id: string
        }
        Update: {
          access_expires_at?: string | null
          encrypted_access_token?: string | null
          encrypted_refresh_token?: string
          slot?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      youtube_tokens: {
        Row: {
          access_expires_at: string | null
          encrypted_access_token: string | null
          encrypted_refresh_token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_expires_at?: string | null
          encrypted_access_token?: string | null
          encrypted_refresh_token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_expires_at?: string | null
          encrypted_access_token?: string | null
          encrypted_refresh_token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      youtube_upload_usage: {
        Row: {
          day: string
          exhausted: boolean
          slot: number
          updated_at: string
          uploads: number
          user_id: string
        }
        Insert: {
          day: string
          exhausted?: boolean
          slot: number
          updated_at?: string
          uploads?: number
          user_id: string
        }
        Update: {
          day?: string
          exhausted?: boolean
          slot?: number
          updated_at?: string
          uploads?: number
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      seed_user_defaults: { Args: { _user_id: string }; Returns: undefined }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
