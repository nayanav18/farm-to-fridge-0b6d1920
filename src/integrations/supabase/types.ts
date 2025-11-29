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
      historical_sales: {
        Row: {
          category: string
          created_at: string | null
          date: string
          id: string
          product_id: number
          product_name: string
          quantity_sold: number
          revenue: number
          supermarket_branch: string
          wastage_units: number | null
        }
        Insert: {
          category: string
          created_at?: string | null
          date: string
          id?: string
          product_id: number
          product_name: string
          quantity_sold: number
          revenue: number
          supermarket_branch: string
          wastage_units?: number | null
        }
        Update: {
          category?: string
          created_at?: string | null
          date?: string
          id?: string
          product_id?: number
          product_name?: string
          quantity_sold?: number
          revenue?: number
          supermarket_branch?: string
          wastage_units?: number | null
        }
        Relationships: []
      }
      localmarket_stock: {
        Row: {
          accepted_at: string | null
          category: string
          company_name: string
          created_at: string | null
          date: string
          expiry_date: string
          id: string
          is_perishable: boolean
          lot_id: string
          manufacturing_date: string
          price_per_unit: number
          product_id: number
          product_name: string
          quantity: number
          shelf_life_days: number
          source_supermarket: string | null
          storage_temperature: string
          transfer_date: string | null
        }
        Insert: {
          accepted_at?: string | null
          category: string
          company_name: string
          created_at?: string | null
          date?: string
          expiry_date: string
          id?: string
          is_perishable?: boolean
          lot_id: string
          manufacturing_date: string
          price_per_unit: number
          product_id: number
          product_name: string
          quantity: number
          shelf_life_days: number
          source_supermarket?: string | null
          storage_temperature: string
          transfer_date?: string | null
        }
        Update: {
          accepted_at?: string | null
          category?: string
          company_name?: string
          created_at?: string | null
          date?: string
          expiry_date?: string
          id?: string
          is_perishable?: boolean
          lot_id?: string
          manufacturing_date?: string
          price_per_unit?: number
          product_id?: number
          product_name?: string
          quantity?: number
          shelf_life_days?: number
          source_supermarket?: string | null
          storage_temperature?: string
          transfer_date?: string | null
        }
        Relationships: []
      }
      producer_stock: {
        Row: {
          category: string
          company_name: string
          created_at: string | null
          date: string
          expiry_date: string
          id: string
          is_perishable: boolean
          lot_id: string
          manufacturing_date: string
          price_per_unit: number
          product_id: number
          product_name: string
          quantity_stocked: number
          shelf_life_days: number
          stock_batch_quantity: number
          storage_temperature: string
        }
        Insert: {
          category: string
          company_name: string
          created_at?: string | null
          date?: string
          expiry_date: string
          id?: string
          is_perishable?: boolean
          lot_id: string
          manufacturing_date: string
          price_per_unit: number
          product_id: number
          product_name: string
          quantity_stocked: number
          shelf_life_days: number
          stock_batch_quantity: number
          storage_temperature: string
        }
        Update: {
          category?: string
          company_name?: string
          created_at?: string | null
          date?: string
          expiry_date?: string
          id?: string
          is_perishable?: boolean
          lot_id?: string
          manufacturing_date?: string
          price_per_unit?: number
          product_id?: number
          product_name?: string
          quantity_stocked?: number
          shelf_life_days?: number
          stock_batch_quantity?: number
          storage_temperature?: string
        }
        Relationships: []
      }
      supermarket_stock: {
        Row: {
          category: string
          company_name: string
          created_at: string | null
          date: string
          expiry_date: string
          id: string
          is_perishable: boolean
          lot_id: string
          manufacturing_date: string
          price_per_unit: number
          product_id: number
          product_name: string
          quantity: number
          shelf_life_days: number
          source_producer: string | null
          storage_temperature: string
          transfer_date: string | null
        }
        Insert: {
          category: string
          company_name: string
          created_at?: string | null
          date?: string
          expiry_date: string
          id?: string
          is_perishable?: boolean
          lot_id: string
          manufacturing_date: string
          price_per_unit: number
          product_id: number
          product_name: string
          quantity: number
          shelf_life_days: number
          source_producer?: string | null
          storage_temperature: string
          transfer_date?: string | null
        }
        Update: {
          category?: string
          company_name?: string
          created_at?: string | null
          date?: string
          expiry_date?: string
          id?: string
          is_perishable?: boolean
          lot_id?: string
          manufacturing_date?: string
          price_per_unit?: number
          product_id?: number
          product_name?: string
          quantity?: number
          shelf_life_days?: number
          source_producer?: string | null
          storage_temperature?: string
          transfer_date?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
