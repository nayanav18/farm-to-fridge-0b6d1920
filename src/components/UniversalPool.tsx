// src/components/UniversalPool.tsx
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

type PoolItem = {
  id: number;
  product_name: string;
  quantity: number;
  source: string;
  created_at: string;
};

export default function UniversalPool({ currentPlace }: { currentPlace?: string }) {
  const [pool, setPool] = useState<PoolItem[]>([]);

  const postToPool = () => {
    const name = prompt("Product name?");
    if (!name) return;

    const qtyStr = prompt("Quantity?");
    if (!qtyStr) return;
    const qty = Number(qtyStr);
    if (isNaN(qty) || qty <= 0) return alert("Invalid quantity");

    const newItem: PoolItem = {
      id: Date.now(),
      product_name: name,
      quantity: qty,
      source: currentPlace || "unknown",
      created_at: new Date().toISOString(),
    };

    setPool((prev) => [newItem, ...prev]);
  };

  const acceptItem = (id: number) => {
    alert("Accepted the item");
    setPool((prev) => prev.filter((p) => p.id !== id));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Universal Pool</CardTitle>
        <CardDescription>
          Temporary pool — works only in UI, nothing saved to backend
        </CardDescription>
      </CardHeader>

      <CardContent>
        {pool.length === 0 ? (
          <p className="text-muted-foreground">No pool entries yet.</p>
        ) : (
          pool.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between p-3 bg-muted/10 rounded mb-2"
            >
              <div>
                <div className="font-medium">{p.product_name}</div>
                <div className="text-xs text-muted-foreground">
                  {p.quantity} units • from {p.source}
                </div>
              </div>

              <Button size="sm" onClick={() => acceptItem(p.id)}>
                Accept
              </Button>
            </div>
          ))
        )}

        <Button className="mt-4" onClick={postToPool}>
          Post to Pool
        </Button>
      </CardContent>
    </Card>
  );
}
