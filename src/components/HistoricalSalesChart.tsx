import { useEffect, useState } from "react";
import { Line } from "react-chartjs-2";
import Papa from "papaparse";

interface SalesData {
  date: string;
  quantity: number;
  revenue: number;
}

const HistoricalSalesChart = () => {
  const [chartData, setChartData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadHistoricalData = async () => {
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

        // Group by date and sum quantities
        const salesByDate: { [key: string]: SalesData } = {};
        
        allData.forEach((row: any) => {
          if (row.Date && row.Quantity_Sold && row.Revenue) {
            const date = row.Date;
            if (!salesByDate[date]) {
              salesByDate[date] = { date, quantity: 0, revenue: 0 };
            }
            salesByDate[date].quantity += row.Quantity_Sold;
            salesByDate[date].revenue += row.Revenue;
          }
        });

        // Convert to array and sort by date
        const sortedData = Object.values(salesByDate)
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
          .slice(-30); // Last 30 days

        setChartData({
          labels: sortedData.map(d => new Date(d.date).toLocaleDateString()),
          datasets: [
            {
              label: "Total Units Sold",
              data: sortedData.map(d => d.quantity),
              borderColor: "hsl(145, 65%, 45%)",
              backgroundColor: "hsla(145, 65%, 45%, 0.1)",
              fill: true,
              tension: 0.4,
              yAxisID: "y",
            },
            {
              label: "Revenue (₹)",
              data: sortedData.map(d => d.revenue),
              borderColor: "hsl(35, 90%, 55%)",
              backgroundColor: "hsla(35, 90%, 55%, 0.1)",
              fill: true,
              tension: 0.4,
              yAxisID: "y1",
            },
          ],
        });
      } catch (error) {
        console.error("Error loading historical data:", error);
      } finally {
        setLoading(false);
      }
    };

    loadHistoricalData();
  }, []);

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Loading historical sales data...</div>;
  }

  if (!chartData) {
    return <div className="text-center py-8 text-muted-foreground">No historical data available</div>;
  }

  return (
    <div className="bg-card p-4 rounded-lg border border-border">
      <Line
        data={chartData}
        options={{
          responsive: true,
          maintainAspectRatio: true,
          interaction: {
            mode: "index",
            intersect: false,
          },
          plugins: {
            legend: {
              position: "top",
            },
            title: {
              display: true,
              text: "Historical Sales Trends (Last 30 Days)",
            },
          },
          scales: {
            y: {
              type: "linear",
              display: true,
              position: "left",
              title: {
                display: true,
                text: "Units Sold",
              },
            },
            y1: {
              type: "linear",
              display: true,
              position: "right",
              title: {
                display: true,
                text: "Revenue (₹)",
              },
              grid: {
                drawOnChartArea: false,
              },
            },
          },
        }}
      />
    </div>
  );
};

export default HistoricalSalesChart;
