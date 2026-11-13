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
      audience_submissions: {
        Row: {
          choice: string | null
          content: string | null
          created_at: string
          id: string
          kind: string
          nickname: string | null
          owner_id: string
          round_id: string | null
          status: string
        }
        Insert: {
          choice?: string | null
          content?: string | null
          created_at?: string
          id?: string
          kind: string
          nickname?: string | null
          owner_id: string
          round_id?: string | null
          status?: string
        }
        Update: {
          choice?: string | null
          content?: string | null
          created_at?: string
          id?: string
          kind?: string
          nickname?: string | null
          owner_id?: string
          round_id?: string | null
          status?: string
        }
        Relationships: []
      }
      live_events: {
        Row: {
          content: string | null
          created_at: string
          diamonds: number
          gift_count: number
          gift_name: string | null
          id: string
          nickname: string | null
          owner_id: string
          round_id: string | null
          type: string
          user_id: string | null
          vote_choice: string | null
        }
        Insert: {
          content?: string | null
          created_at?: string
          diamonds?: number
          gift_count?: number
          gift_name?: string | null
          id?: string
          nickname?: string | null
          owner_id: string
          round_id?: string | null
          type: string
          user_id?: string | null
          vote_choice?: string | null
        }
        Update: {
          content?: string | null
          created_at?: string
          diamonds?: number
          gift_count?: number
          gift_name?: string | null
          id?: string
          nickname?: string | null
          owner_id?: string
          round_id?: string | null
          type?: string
          user_id?: string | null
          vote_choice?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          id: string
        }
        Insert: {
          created_at?: string
          display_name?: string
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
        }
        Relationships: []
      }
      questions: {
        Row: {
          category: string
          created_at: string
          demo: boolean
          favorite: boolean
          gimmick: string
          id: string
          owner_id: string
          text: string
          used: boolean
        }
        Insert: {
          category?: string
          created_at?: string
          demo?: boolean
          favorite?: boolean
          gimmick: string
          id?: string
          owner_id?: string
          text: string
          used?: boolean
        }
        Update: {
          category?: string
          created_at?: string
          demo?: boolean
          favorite?: boolean
          gimmick?: string
          id?: string
          owner_id?: string
          text?: string
          used?: boolean
        }
        Relationships: []
      }
      studio_sessions: {
        Row: {
          audience_code: string
          audience_state: Json
          ingest_key: string
          overlay_state: Json
          overlay_token: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          audience_code?: string
          audience_state?: Json
          ingest_key?: string
          overlay_state?: Json
          overlay_token?: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          audience_code?: string
          audience_state?: Json
          ingest_key?: string
          overlay_state?: Json
          overlay_token?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_audience_state: { Args: { _code: string }; Returns: Json }
      get_overlay_state: { Args: { _token: string }; Returns: Json }
      ingest_live_events: {
        Args: { _events: Json; _key: string }
        Returns: number
      }
      rotate_ingest_key: { Args: never; Returns: string }
      rotate_overlay_token: { Args: never; Returns: string }
      submit_audience: {
        Args: {
          _choice: string
          _code: string
          _content: string
          _kind: string
          _nickname: string
          _round: string
        }
        Returns: boolean
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
