import Papa from "papaparse";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export default function UploadCSV() {
  const [loading, setLoading] = useState(false);

  const convertRow = (row: any, table: "producer_stock" | "supermarket_stock" | "historical_sales") => {
    switch (table) {
      case "producer_stock":
        return {
          category: row.Category,
          company_name: row.Company_Name,
          date: row.Date,
          expiry_date: row.Expiry_Date,
          is_perishable: row.Is_Perishable === "True",
          lot_id: row.Lot_ID,
          manufacturing_date: row.Manufacturing_Date,
          price_per_unit: Number(row.Price_per_Unit),
          product_id: Number(row.Product_ID),
          product_name: row.Product_Name,
          quantity_stocked: Number(row.Quantity_Stocked),
          shelf_life_days: Number(row.Shelf_Life_Days),
          stock_batch_quantity: Number(row.Stock_Batch_Quantity),
          storage_temperature: row.Storage_Temperature,
        };

      case "supermarket_stock":
        return {
          category: row.Category,
          company_name: row.Company_Name,
          date: row.Date,
          expiry_date: row.Expiry_Date,
          is_perishable: row.Is_Perishable === "True",
          lot_id: row.Lot_ID,
          manufacturing_date: row.Manufacturing_Date,
          price_per_unit: Number(row.Price_per_Unit),
          product_id: Number(row.Product_ID),
          product_name: row.Product_Name,
          quantity: Number(row.Quantity_Stocked), // IMPORTANT
          shelf_life_days: Number(row.Shelf_Life_Days),
          source_producer: null,
          storage_temperature: row.Storage_Temperature,
          transfer_date: row.Date,
        };

      case "historical_sales":
        return {
          category: row.Category,
          date: row.Date,
          product_id: Number(row.Product_ID),
          product_name: row.Product_Name,
          quantity_sold: Number(row.Quantity_Sold),
          revenue: Number(row.Revenue),
          supermarket_branch: row.Supermarket_Branch,
          wastage_units: Number(row.Wastage_Units ?? 0),
        };

      default:
        return null;
    }
  };

  const upload = async (table: "producer_stock" | "supermarket_stock" | "historical_sales", file: File) => {
    return new Promise((resolve) => {
      Papa.parse(file, {
        header: true,
        complete: async (results) => {
          const rows = results.data
            .filter((r: any) => r.Product_ID) // ignore blank lines
            .map((r: any) => convertRow(r, table));

          const { error } = await supabase.from(table).insert(rows);
          resolve(error);
        },
      });
    });
  };

  const handleUpload = async (e: any, table: "producer_stock" | "supermarket_stock" | "historical_sales") => {
    const file = e.target.files[0];
    if (!file) return;

    setLoading(true);

    const error = await upload(table, file);
    setLoading(false);

    if (error) alert((error as any).message || "An error occurred");
    else alert(`Imported into ${table} successfully`);
  };

  return (
    <div className="space-y-4">
      <div>
        <p>Upload Producer Stock CSV</p>
        <input type="file" onChange={(e) => handleUpload(e, "producer_stock")} />
      </div>

      <div>
        <p>Upload Supermarket Stock CSV</p>
        <input type="file" onChange={(e) => handleUpload(e, "supermarket_stock")} />
      </div>

      <div>
        <p>Upload Historical Sales CSV</p>
        <input type="file" onChange={(e) => handleUpload(e, "historical_sales")} />
      </div>

      {loading && <p>Uploading…</p>}
    </div>
  );
}
