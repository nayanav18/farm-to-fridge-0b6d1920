import { useState, useEffect } from "react";
import { toast } from "sonner";
import { loadSupermarketCSV, loadLocalMarketCSV, generateHistoricalFromCSV } from "src/lib/utils/csvLoader";

export interface StockItem {
  id: string;
  product: string;
  quantity: number;
  unit: string;
  expiryDate: string;
  price: number;
}

export interface HistoricalSale {
  date: string;
  product: string;
  quantity: number;
  location: string;
}

const INITIAL_PRODUCER_STOCK: StockItem[] = [
  { id: "p1", product: "Tomatoes", quantity: 1000, unit: "kg", expiryDate: "2025-12-15", price: 2.5 },
  { id: "p2", product: "Potatoes", quantity: 2000, unit: "kg", expiryDate: "2026-01-20", price: 1.8 },
  { id: "p3", product: "Apples", quantity: 800, unit: "kg", expiryDate: "2025-12-10", price: 3.2 },
  { id: "p4", product: "Carrots", quantity: 1500, unit: "kg", expiryDate: "2025-12-25", price: 2.0 },
  { id: "p5", product: "Lettuce", quantity: 600, unit: "kg", expiryDate: "2025-12-05", price: 2.8 },
];

const INITIAL_SUPERMARKET_STOCKS: Record<string, StockItem[]> = {
  "Supermarket A": [
    { id: "sa1", product: "Tomatoes", quantity: 150, unit: "kg", expiryDate: "2025-12-08", price: 3.5 },
    { id: "sa2", product: "Apples", quantity: 200, unit: "kg", expiryDate: "2025-12-07", price: 4.0 },
  ],
  "Supermarket B": [
    { id: "sb1", product: "Potatoes", quantity: 300, unit: "kg", expiryDate: "2025-12-12", price: 2.5 },
    { id: "sb2", product: "Carrots", quantity: 180, unit: "kg", expiryDate: "2025-12-09", price: 2.8 },
  ],
  "Supermarket C": [
    { id: "sc1", product: "Lettuce", quantity: 120, unit: "kg", expiryDate: "2025-12-06", price: 3.5 },
    { id: "sc2", product: "Tomatoes", quantity: 100, unit: "kg", expiryDate: "2025-12-08", price: 3.5 },
  ],
};

const INITIAL_LOCALMARKET_STOCKS: Record<string, StockItem[]> = {
  "Local Market A": [],
  "Local Market B": [],
};

const INITIAL_HISTORICAL_SALES: HistoricalSale[] = generateHistoricalSales();

function generateHistoricalSales(): HistoricalSale[] {
  const products = ["Tomatoes", "Potatoes", "Apples", "Carrots", "Lettuce"];
  const locations = ["Supermarket A", "Supermarket B", "Supermarket C", "Local Market A", "Local Market B", "Local Market C"];
  const sales: HistoricalSale[] = [];
  
  // Generate 90 days of historical data
  for (let i = 90; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    
    products.forEach(product => {
      locations.forEach(location => {
        const baseQuantity = 50 + Math.random() * 100;
        const seasonalFactor = Math.sin((i / 30) * Math.PI) * 20;
        const quantity = Math.round(baseQuantity + seasonalFactor + (Math.random() - 0.5) * 30);
        
        sales.push({
          date: dateStr,
          product,
          quantity: Math.max(10, quantity),
          location,
        });
      });
    });
  }
  
  return sales;
}

export const useStockData = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [producerStock, setProducerStock] = useState<StockItem[]>(() => {
    const saved = localStorage.getItem("producerStock");
    return saved ? JSON.parse(saved) : INITIAL_PRODUCER_STOCK;
  });

  const [supermarketStocks, setSupermarketStocks] = useState<Record<string, StockItem[]>>(() => {
    const saved = localStorage.getItem("supermarketStocks");
    return saved ? JSON.parse(saved) : INITIAL_SUPERMARKET_STOCKS;
  });

  const [localMarketStocks, setLocalMarketStocks] = useState<Record<string, StockItem[]>>(() => {
    const saved = localStorage.getItem("localMarketStocks");
    return saved ? JSON.parse(saved) : INITIAL_LOCALMARKET_STOCKS;
  });

  const [historicalSales, setHistoricalSales] = useState<HistoricalSale[]>(() => {
    const saved = localStorage.getItem("historicalSales");
    return saved ? JSON.parse(saved) : INITIAL_HISTORICAL_SALES;
  });

  // Load CSV data on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const [supA, supB, supC, localA, localB, historical] = await Promise.all([
          loadSupermarketCSV('supermarket_A.csv'),
          loadSupermarketCSV('supermarket_B.csv'),
          loadSupermarketCSV('supermarket_C.csv'),
          loadLocalMarketCSV('localmarket_A.csv'),
          loadLocalMarketCSV('localmarket_B.csv'),
          generateHistoricalFromCSV(),
        ]);

        const savedSuper = localStorage.getItem("supermarketStocks");
        const savedLocal = localStorage.getItem("localMarketStocks");
        const savedHistorical = localStorage.getItem("historicalSales");

        if (!savedSuper) {
          setSupermarketStocks({
            "Supermarket A": supA,
            "Supermarket B": supB,
            "Supermarket C": supC,
          });
        }

        if (!savedLocal) {
          setLocalMarketStocks({
            "Local Market A": localA,
            "Local Market B": localB,
          });
        }

        if (!savedHistorical && historical.length > 0) {
          setHistoricalSales(historical);
        }
      } catch (error) {
        console.error("Error loading CSV data:", error);
        toast.error("Failed to load data from CSV files");
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  useEffect(() => {
    localStorage.setItem("producerStock", JSON.stringify(producerStock));
  }, [producerStock]);

  useEffect(() => {
    localStorage.setItem("supermarketStocks", JSON.stringify(supermarketStocks));
  }, [supermarketStocks]);

  useEffect(() => {
    localStorage.setItem("localMarketStocks", JSON.stringify(localMarketStocks));
  }, [localMarketStocks]);

  useEffect(() => {
    localStorage.setItem("historicalSales", JSON.stringify(historicalSales));
  }, [historicalSales]);

  const moveToSupermarket = (itemId: string, supermarket: string, quantity: number) => {
    const item = producerStock.find(i => i.id === itemId);
    if (!item) {
      toast.error("Item not found");
      return;
    }

    if (quantity > item.quantity) {
      toast.error("Insufficient quantity");
      return;
    }

    const newItem: StockItem = {
      id: `${supermarket.toLowerCase().replace(/\s+/g, '')}_${Date.now()}`,
      product: item.product,
      quantity,
      unit: item.unit,
      expiryDate: item.expiryDate,
      price: item.price * 1.2,
    };

    setSupermarketStocks(prev => ({
      ...prev,
      [supermarket]: [...(prev[supermarket] || []), newItem],
    }));

    setProducerStock(prev =>
      prev.map(i =>
        i.id === itemId
          ? { ...i, quantity: i.quantity - quantity }
          : i
      ).filter(i => i.quantity > 0)
    );

    toast.success(`Moved ${quantity}${item.unit} of ${item.product} to ${supermarket}`);
  };

  const updateProducerStock = (supermarket: string, itemId: string, quantity: number) => {
    const item = supermarketStocks[supermarket]?.find(i => i.id === itemId);
    if (!item) return;

    const existingProducerItem = producerStock.find(i => i.product === item.product);
    
    if (existingProducerItem) {
      setProducerStock(prev =>
        prev.map(i =>
          i.product === item.product
            ? { ...i, quantity: i.quantity + quantity }
            : i
        )
      );
    } else {
      const newItem: StockItem = {
        id: `p_${Date.now()}`,
        product: item.product,
        quantity,
        unit: item.unit,
        expiryDate: item.expiryDate,
        price: item.price / 1.2,
      };
      setProducerStock(prev => [...prev, newItem]);
    }

    toast.success(`Updated producer stock with ${quantity}${item.unit} of ${item.product}`);
  };

  const shipToLocalMarket = (supermarket: string, itemId: string, localMarket: string) => {
    const item = supermarketStocks[supermarket]?.find(i => i.id === itemId);
    if (!item) return;

    const newItem: StockItem = {
      id: `${localMarket.toLowerCase().replace(/\s+/g, '')}_${Date.now()}`,
      product: item.product,
      quantity: item.quantity,
      unit: item.unit,
      expiryDate: item.expiryDate,
      price: item.price * 1.15,
    };

    setLocalMarketStocks(prev => ({
      ...prev,
      [localMarket]: [...(prev[localMarket] || []), newItem],
    }));

    setSupermarketStocks(prev => ({
      ...prev,
      [supermarket]: prev[supermarket].filter(i => i.id !== itemId),
    }));

    toast.success(`Shipped ${item.quantity}${item.unit} of ${item.product} to ${localMarket}`);
  };

  const redistributeLocalMarket = (sourceMarket: string, itemId: string, targetMarket: string, quantity: number) => {
    const item = localMarketStocks[sourceMarket]?.find(i => i.id === itemId);
    if (!item) {
      toast.error("Item not found");
      return;
    }

    if (quantity > item.quantity) {
      toast.error("Insufficient quantity");
      return;
    }

    const newItem: StockItem = {
      id: `${targetMarket.toLowerCase().replace(/\s+/g, '')}_${Date.now()}`,
      product: item.product,
      quantity,
      unit: item.unit,
      expiryDate: item.expiryDate,
      price: item.price,
    };

    setLocalMarketStocks(prev => ({
      ...prev,
      [targetMarket]: [...(prev[targetMarket] || []), newItem],
      [sourceMarket]: prev[sourceMarket]
        .map(i => i.id === itemId ? { ...i, quantity: i.quantity - quantity } : i)
        .filter(i => i.quantity > 0),
    }));

    toast.success(`Redistributed ${quantity}${item.unit} of ${item.product} from ${sourceMarket} to ${targetMarket}`);
  };

  return {
    producerStock,
    supermarketStocks,
    localMarketStocks,
    historicalSales,
    isLoading,
    moveToSupermarket,
    updateProducerStock,
    shipToLocalMarket,
    redistributeLocalMarket,
  };
};
