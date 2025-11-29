import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Upload, Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

const ProducerDashboard = () => {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    product_name: "",
    category: "Fruits",
    company_name: "",
    quantity_stocked: "",
    price_per_unit: "",
    manufacturing_date: "",
    shelf_life_days: "",
    storage_temperature: "Cool (10-15°C)",
  });

  const { data: producerStock, refetch } = useQuery({
    queryKey: ["producer-stock"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("producer_stock")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const manufacturingDate = new Date(formData.manufacturing_date);
      const expiryDate = new Date(manufacturingDate);
      expiryDate.setDate(expiryDate.getDate() + parseInt(formData.shelf_life_days));

      const { error } = await supabase.from("producer_stock").insert({
        product_id: Math.floor(Math.random() * 10000),
        product_name: formData.product_name,
        category: formData.category,
        company_name: formData.company_name,
        is_perishable: ["Fruits", "Vegetables", "Dairy", "Meat", "Bakery"].includes(formData.category),
        shelf_life_days: parseInt(formData.shelf_life_days),
        storage_temperature: formData.storage_temperature,
        lot_id: `LOT-${new Date().toISOString().split('T')[0]}-${Math.floor(Math.random() * 1000)}`,
        stock_batch_quantity: parseInt(formData.quantity_stocked),
        quantity_stocked: parseInt(formData.quantity_stocked),
        manufacturing_date: formData.manufacturing_date,
        expiry_date: expiryDate.toISOString().split('T')[0],
        price_per_unit: parseFloat(formData.price_per_unit),
      });

      if (error) throw error;

      toast({
        title: "Stock Added Successfully",
        description: `${formData.quantity_stocked} units of ${formData.product_name} added to inventory.`,
      });

      // Reset form
      setFormData({
        product_name: "",
        category: "Fruits",
        company_name: "",
        quantity_stocked: "",
        price_per_unit: "",
        manufacturing_date: "",
        shelf_life_days: "",
        storage_temperature: "Cool (10-15°C)",
      });

      refetch();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border-primary/20">
        <CardHeader className="bg-primary/5">
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" />
            Upload Stock
          </CardTitle>
          <CardDescription>Add new products to your inventory</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="product_name">Product Name</Label>
                <Input
                  id="product_name"
                  value={formData.product_name}
                  onChange={(e) => setFormData({ ...formData, product_name: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Select value={formData.category} onValueChange={(value) => setFormData({ ...formData, category: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Fruits">Fruits</SelectItem>
                    <SelectItem value="Vegetables">Vegetables</SelectItem>
                    <SelectItem value="Dairy">Dairy</SelectItem>
                    <SelectItem value="Meat">Meat</SelectItem>
                    <SelectItem value="Bakery">Bakery</SelectItem>
                    <SelectItem value="Beverages">Beverages</SelectItem>
                    <SelectItem value="Snacks">Snacks</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="company_name">Company Name</Label>
                <Input
                  id="company_name"
                  value={formData.company_name}
                  onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="quantity_stocked">Quantity</Label>
                <Input
                  id="quantity_stocked"
                  type="number"
                  min="1"
                  value={formData.quantity_stocked}
                  onChange={(e) => setFormData({ ...formData, quantity_stocked: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="price_per_unit">Price per Unit (₹)</Label>
                <Input
                  id="price_per_unit"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.price_per_unit}
                  onChange={(e) => setFormData({ ...formData, price_per_unit: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="manufacturing_date">Manufacturing Date</Label>
                <Input
                  id="manufacturing_date"
                  type="date"
                  value={formData.manufacturing_date}
                  onChange={(e) => setFormData({ ...formData, manufacturing_date: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="shelf_life_days">Shelf Life (Days)</Label>
                <Input
                  id="shelf_life_days"
                  type="number"
                  min="1"
                  value={formData.shelf_life_days}
                  onChange={(e) => setFormData({ ...formData, shelf_life_days: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="storage_temperature">Storage Temperature</Label>
                <Select value={formData.storage_temperature} onValueChange={(value) => setFormData({ ...formData, storage_temperature: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Frozen (-18°C)">Frozen (-18°C)</SelectItem>
                    <SelectItem value="Chilled (2-4°C)">Chilled (2-4°C)</SelectItem>
                    <SelectItem value="Cool (10-15°C)">Cool (10-15°C)</SelectItem>
                    <SelectItem value="Ambient (20-25°C)">Ambient (20-25°C)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button type="submit" className="w-full">
              <Upload className="mr-2 h-4 w-4" />
              Add to Stock
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="border-muted">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            Stock History
          </CardTitle>
          <CardDescription>Recently added products</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {producerStock?.map((item) => (
              <div key={item.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                <div>
                  <p className="font-medium">{item.product_name}</p>
                  <p className="text-sm text-muted-foreground">
                    {item.quantity_stocked} units • ₹{item.price_per_unit} • Exp: {new Date(item.expiry_date).toLocaleDateString()}
                  </p>
                </div>
                <div className="text-sm text-muted-foreground">
                  {item.category}
                </div>
              </div>
            ))}
            {!producerStock?.length && (
              <p className="text-center text-muted-foreground py-8">No stock added yet</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProducerDashboard;