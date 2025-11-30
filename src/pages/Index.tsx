// src/pages/Index.tsx
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProducerDashboard } from "@/components/ProducerDashboard";
import SupermarketDashboard from "@/components/SupermarketDashboard";
import LocalMarketDashboard from "@/components/LocalMarketDashboard";

const Index = () => {
  const [activeTab, setActiveTab] = useState("producer");

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4">
          <h1 className="text-3xl font-bold text-foreground">Smart Food Redistribution System</h1>
          <p className="text-muted-foreground mt-1">Producer → Supermarket → Local Market</p>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-6">
            <TabsTrigger value="producer">Producer Dashboard</TabsTrigger>
            <TabsTrigger value="supermarket">Supermarket Dashboard</TabsTrigger>
            <TabsTrigger value="localmarket">Local Market Dashboard</TabsTrigger>
          </TabsList>

          <TabsContent value="producer">
            <ProducerDashboard />
          </TabsContent>

          <TabsContent value="supermarket">
            <SupermarketDashboard />
          </TabsContent>

          <TabsContent value="localmarket">
            <LocalMarketDashboard />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Index;
