import { useEffect, useState } from "react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import Papa from "papaparse";
import * as tf from "@tensorflow/tfjs";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

interface PredictionChartProps {
  productName: string;
}

const PredictionChart = ({ productName }: PredictionChartProps) => {
  const [chartData, setChartData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadDataAndPredict = async () => {
      setLoading(true);
      try {
        // Load historical data from CSV files
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

        // Filter data for the selected product
        const productData = allData
          .filter((row: any) => row.Product_Name === productName && row.Date && row.Quantity_Sold)
          .map((row: any) => ({
            date: new Date(row.Date),
            quantity: row.Quantity_Sold,
          }))
          .sort((a, b) => a.date.getTime() - b.date.getTime())
          .slice(-60); // Last 60 data points

        if (productData.length < 7) {
          setChartData({
            labels: [],
            datasets: [],
          });
          setLoading(false);
          return;
        }

        // Prepare data for prediction
        const quantities = productData.map(d => d.quantity);
        const mean = quantities.reduce((a, b) => a + b, 0) / quantities.length;
        const std = Math.sqrt(quantities.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / quantities.length);
        const normalizedQuantities = quantities.map(q => (q - mean) / std);

        // Simple moving average prediction (simplified ML approach)
        const windowSize = Math.min(7, productData.length);
        const predictions: number[] = [];
        
        for (let i = 0; i < 7; i++) {
          const recentData = normalizedQuantities.slice(-windowSize);
          const avg = recentData.reduce((a, b) => a + b, 0) / recentData.length;
          const denormalized = avg * std + mean;
          predictions.push(Math.max(0, Math.round(denormalized)));
          normalizedQuantities.push(avg);
        }

        // Prepare chart data
        const historicalDates = productData.slice(-14).map(d => d.date.toLocaleDateString());
        const historicalValues = productData.slice(-14).map(d => d.quantity);
        
        const futureDates = Array.from({ length: 7 }, (_, i) => {
          const date = new Date();
          date.setDate(date.getDate() + i + 1);
          return date.toLocaleDateString();
        });

        setChartData({
          labels: [...historicalDates, ...futureDates],
          datasets: [
            {
              label: "Historical Sales",
              data: [...historicalValues, ...Array(7).fill(null)],
              borderColor: "hsl(145, 65%, 45%)",
              backgroundColor: "hsla(145, 65%, 45%, 0.1)",
              fill: true,
              tension: 0.4,
              pointRadius: 4,
            },
            {
              label: "Predicted Demand",
              data: [...Array(14).fill(null), ...predictions],
              borderColor: "hsl(35, 90%, 55%)",
              backgroundColor: "hsla(35, 90%, 55%, 0.1)",
              fill: true,
              borderDash: [5, 5],
              tension: 0.4,
              pointRadius: 4,
            },
          ],
        });
      } catch (error) {
        console.error("Error loading data:", error);
      } finally {
        setLoading(false);
      }
    };

    if (productName) {
      loadDataAndPredict();
    }
  }, [productName]);

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Loading prediction model...</div>;
  }

  if (!chartData || chartData.labels.length === 0) {
    return <div className="text-center py-8 text-muted-foreground">Insufficient historical data for {productName}</div>;
  }

  return (
    <div className="bg-card p-4 rounded-lg border border-border">
      <Line
        data={chartData}
        options={{
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: {
              position: "top",
            },
            title: {
              display: true,
              text: `7-Day Demand Forecast for ${productName}`,
            },
          },
          scales: {
            y: {
              beginAtZero: true,
              title: {
                display: true,
                text: "Quantity Sold",
              },
            },
            x: {
              title: {
                display: true,
                text: "Date",
              },
            },
          },
        }}
      />
    </div>
  );
};

export default PredictionChart;