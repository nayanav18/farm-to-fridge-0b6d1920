// UnionPoolDashboard.tsx
import React, { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";

type PoolItem = {
  id: string;
  product_name: string;
  quantity: number;
  price_per_unit: number;
  source: string;
  expiry_date?: string;
  created_at: string;
};

const POOL_KEY = "union_pool_v2";

export default function UnionPoolDashboard() {
  const { toast } = useToast();
  const [pool, setPool] = useState<PoolItem[]>([]);
  const [form, setForm] = useState({ product_name: "", quantity: "", price_per_unit: "", source: "" });

  useEffect(() => {
    const raw = localStorage.getItem(POOL_KEY);
    setPool(raw ? JSON.parse(raw) : []);
  }, []);

  const persist = (arr: PoolItem[]) => {
    localStorage.setItem(POOL_KEY, JSON.stringify(arr));
    setPool(arr);
  };

  const handlePost = () => {
    if (!form.product_name || !form.quantity) {
      toast({ title: "Missing", description: "Product & quantity required", variant: "destructive" });
      return;
    }
    const item: PoolItem = {
      id: `pool-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
      product_name: form.product_name,
      quantity: Number(form.quantity),
      price_per_unit: Number(form.price_per_unit || 0),
      source: form.source || "anonymous",
      expiry_date: undefined,
      created_at: new Date().toISOString(),
    };
    const next = [item, ...pool];
    persist(next);
    setForm({ product_name: "", quantity: "", price_per_unit: "", source: "" });
    toast({ title: "Posted", description: `${item.product_name} added to Union Pool` });
  };

  const handleClaim = (id: string) => {
    const next = pool.filter(p => p.id !== id);
    persist(next);
    toast({ title: "Claimed", description: "Item claimed — removed from pool" });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Union Pool (Shared Marketplace)</CardTitle>
          <CardDescription>Post overstock / near-expiry items. Anyone can claim.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
            <Input placeholder="Product name" value={form.product_name} onChange={(e)=>setForm({...form, product_name: e.target.value})} />
            <Input placeholder="Quantity" value={form.quantity} onChange={(e)=>setForm({...form, quantity: e.target.value})} />
            <Input placeholder="Price per unit" value={form.price_per_unit} onChange={(e)=>setForm({...form, price_per_unit: e.target.value})} />
            <Input placeholder="Source (company)" value={form.source} onChange={(e)=>setForm({...form, source: e.target.value})} />
          </div>
          <div className="flex gap-2">
            <Button onClick={handlePost}>Post to Pool</Button>
            <Button variant="outline" onClick={()=>{ setForm({ product_name: "", quantity: "", price_per_unit: "", source: "" }); }}>Reset</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Available Items</CardTitle><CardDescription>Anyone can claim — item is removed</CardDescription></CardHeader>
        <CardContent>
          {pool.length === 0 ? <p className="text-center text-muted-foreground py-6">No items in pool</p> :
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Posted</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pool.map(item => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.product_name}</TableCell>
                      <TableCell>{item.quantity}</TableCell>
                      <TableCell>₹{item.price_per_unit}</TableCell>
                      <TableCell>{item.source}</TableCell>
                      <TableCell>{new Date(item.created_at).toLocaleString()}</TableCell>
                      <TableCell><Button variant="secondary" onClick={()=>handleClaim(item.id)}>Claim</Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          }
        </CardContent>
      </Card>
    </div>
  );
}
