import Papa from 'papaparse';
import { StockItem, HistoricalSale } from '@/hooks/useStockData';

interface SupermarketRow {
  Date: string;
  Product_Name: string;
  Category: string;
  Expiry_Date: string;
  Quantity_Stocked: string;
  Quantity_Sold: string;
  Price_per_Unit: string;
  On_Hand_After_Sale: string;
  Supermarket_Branch: string;
}

interface LocalMarketRow {
  Date: string;
  Product_Name: string;
  Category: string;
  Quantity_Stocked: string;
  Quantity_Sold: string;
  'Price_per_Unit (₹)': string;
  Shop_Name: string;
}

export async function loadSupermarketCSV(filename: string): Promise<StockItem[]> {
  try {
    const response = await fetch(`/data/${filename}`);
    const csvText = await response.text();
    
    return new Promise((resolve) => {
      Papa.parse<SupermarketRow>(csvText, {
        header: true,
        complete: (results) => {
          const stockMap = new Map<string, StockItem>();
          
          results.data.forEach((row, index) => {
            if (!row.Product_Name) return;
            
            const key = row.Product_Name;
            const quantity = parseInt(row.On_Hand_After_Sale || row.Quantity_Stocked || '0');
            const price = parseFloat(row.Price_per_Unit || '0');
            
            if (stockMap.has(key)) {
              const existing = stockMap.get(key)!;
              existing.quantity += quantity;
            } else {
              stockMap.set(key, {
                id: `${filename}_${index}`,
                product: row.Product_Name,
                quantity: quantity,
                unit: 'units',
                expiryDate: row.Expiry_Date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                price: price,
              });
            }
          });
          
          resolve(Array.from(stockMap.values()).slice(0, 50));
        },
      });
    });
  } catch (error) {
    console.error(`Error loading ${filename}:`, error);
    return [];
  }
}

export async function loadLocalMarketCSV(filename: string): Promise<StockItem[]> {
  try {
    const response = await fetch(`/data/${filename}`);
    const csvText = await response.text();
    
    return new Promise((resolve) => {
      Papa.parse<LocalMarketRow>(csvText, {
        header: true,
        complete: (results) => {
          const stockMap = new Map<string, StockItem>();
          
          results.data.forEach((row, index) => {
            if (!row.Product_Name) return;
            
            const key = row.Product_Name;
            const quantity = parseInt(row.Quantity_Stocked || '0');
            const price = parseFloat(row['Price_per_Unit (₹)'] || '0');
            
            if (stockMap.has(key)) {
              const existing = stockMap.get(key)!;
              existing.quantity += quantity;
            } else {
              stockMap.set(key, {
                id: `${filename}_${index}`,
                product: row.Product_Name,
                quantity: quantity,
                unit: 'units',
                expiryDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                price: price,
              });
            }
          });
          
          resolve(Array.from(stockMap.values()).slice(0, 50));
        },
      });
    });
  } catch (error) {
    console.error(`Error loading ${filename}:`, error);
    return [];
  }
}

export async function generateHistoricalFromCSV(): Promise<HistoricalSale[]> {
  const sales: HistoricalSale[] = [];
  const locations = [
    'Supermarket A',
    'Supermarket B',
    'Supermarket C',
    'Local Market A',
    'Local Market B',
  ];

  try {
    // Load supermarket data for historical sales
    const supermarketFiles = ['supermarket_A.csv', 'supermarket_B.csv', 'supermarket_C.csv'];
    
    for (let i = 0; i < supermarketFiles.length; i++) {
      const response = await fetch(`/data/${supermarketFiles[i]}`);
      const csvText = await response.text();
      
      await new Promise<void>((resolve) => {
        Papa.parse<SupermarketRow>(csvText, {
          header: true,
          complete: (results) => {
            results.data.slice(0, 100).forEach((row) => {
              if (row.Date && row.Product_Name && row.Quantity_Sold) {
                sales.push({
                  date: row.Date,
                  product: row.Product_Name,
                  quantity: parseInt(row.Quantity_Sold || '0'),
                  location: locations[i],
                });
              }
            });
            resolve();
          },
        });
      });
    }

    // Load local market data
    const localMarketFiles = ['localmarket_A.csv', 'localmarket_B.csv'];
    
    for (let i = 0; i < localMarketFiles.length; i++) {
      const response = await fetch(`/data/${localMarketFiles[i]}`);
      const csvText = await response.text();
      
      await new Promise<void>((resolve) => {
        Papa.parse<LocalMarketRow>(csvText, {
          header: true,
          complete: (results) => {
            results.data.slice(0, 100).forEach((row) => {
              if (row.Date && row.Product_Name && row.Quantity_Sold) {
                sales.push({
                  date: row.Date,
                  product: row.Product_Name,
                  quantity: parseInt(row.Quantity_Sold || '0'),
                  location: locations[3 + i],
                });
              }
            });
            resolve();
          },
        });
      });
    }
  } catch (error) {
    console.error('Error generating historical sales:', error);
  }

  return sales;
}
