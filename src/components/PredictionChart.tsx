import React from "react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  LineElement,
  CategoryScale,
  LinearScale,
  PointElement,
  Tooltip,
  Legend
} from "chart.js";

ChartJS.register(
  LineElement,
  CategoryScale,
  LinearScale,
  PointElement,
  Tooltip,
  Legend
);

export default function PredictionChart({ csvData, productName }: any) {
  if (!productName) return <p>Select a product to see graph</p>;

  const filtered = csvData.filter(
    (row: any) => row.Product_Name === productName
  );

  const labels = filtered.map((r: any) => r.Date);
  const values = filtered.map((r: any) => Number(r.Quantity_Sold));

  const data = {
    labels,
    datasets: [
      {
        label: `${productName} Sales Trend`,
        data: values,
        borderWidth: 2,
        borderColor: "#3b82f6",
        tension: 0.3,
        pointRadius: 3,
      },
    ],
  };

  return (
    <div>
      <Line data={data} />
    </div>
  );
}
