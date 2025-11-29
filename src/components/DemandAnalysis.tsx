import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Package } from "lucide-react";
import Papa from "papaparse";

interface ProductDemand {
  productName: string;
  category: string;
  totalSold: number;
  revenue: number;
  avgDailyDemand: number;
}

const DemandAnalysis = () => {
  const [topProducts, setTopProducts] = useState<ProductDemand[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const analyzeCurrentDemand = async () => {
      setLoading(true);
      try {
        const csvFiles = [
          "/data/supermarket_A_20000_single.csv",
          "/data/supermarket_B_20000.csv",
          "/data/supermarket_C_20000.csv",
        ];

        let allData: any[] = [];
        
        for (const file of csvFiles) {
          const response = await fetch(file);
          const csvText = await response.text();
          const parsed = Papa.parse(csvText, { header: true, dynamicTyping: true });
          allData = allData.concat(parsed.data);
        }

        // Get last 7 days of data
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const recentData = allData.filter((row: any) => {
          if (!row.Date) return false;
          const rowDate = new Date(row.Date);
          return rowDate >= sevenDaysAgo;
        });

        // Group by product
        const productMap: { [key: string]: ProductDemand } = {};
        
        recentData.forEach((row: any) => {
          if (row.Product_Name && row.Quantity_Sold && row.Revenue) {
            if (!productMap[row.Product_Name]) {
              productMap[row.Product_Name] = {
                productName: row.Product_Name,
                category: row.Category || "Unknown",
                totalSold: 0,
                revenue: 0,
                avgDailyDemand: 0,
              };
            }
            productMap[row.Product_Name].totalSold += row.Quantity_Sold;
            productMap[row.Product_Name].revenue += row.Revenue;
          }
        });

        // Calculate average daily demand and sort
        const productsArray = Object.values(productMap).map(p => ({
          ...p,
          avgDailyDemand: Math.round(p.totalSold / 7),
        })).sort((a, b) => b.totalSold - a.totalSold).slice(0, 10);

        setTopProducts(productsArray);
      } catch (error) {
        console.error("Error analyzing demand:", error);
      } finally {
        setLoading(false);
      }
    };

    analyzeCurrentDemand();
  }, []);

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Analyzing current demand...</div>;
  }

  return (
    <Card className="border-secondary/20">
      <CardHeader className="bg-secondary/5">
        <CardTitle className="flex items-center gap-2">
          <Package className="h-5 w-5 text-secondary" />
          Currently in Demand
        </CardTitle>
        <CardDescription>Top 10 products by sales volume (Last 7 days)</CardDescription>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="space-y-3">
          {topProducts.map((product, index) => (
            <div key={product.productName} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-secondary/20 text-secondary font-bold">
                  {index + 1}
                </div>
                <div>
                  <p className="font-medium">{product.productName}</p>
                  <p className="text-xs text-muted-foreground">{product.category}</p>
                </div>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-1 text-secondary">
                  <TrendingUp className="h-4 w-4" />
                  <span className="font-semibold">{product.totalSold}</span>
                  <span className="text-xs text-muted-foreground">units</span>
                </div>
                <p className="text-xs text-muted-foreground">~{product.avgDailyDemand}/day</p>
                <p className="text-xs font-medium">₹{product.revenue.toFixed(2)}</p>
              </div>
            </div>
          ))}
          {!topProducts.length && (
            <p className="text-center text-muted-foreground py-8">No demand data available</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default DemandAnalysis;
