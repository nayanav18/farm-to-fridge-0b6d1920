// src/pages/Index.tsx
import React, { useState } from "react";
import ProducerDashboard from "@/components/ProducerDashboard";
import SupermarketDashboard from "@/components/SupermarketDashboard";
import LocalMarketDashboard from "@/components/LocalMarketDashboard";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

const Index: React.FC = () => {
  const [active, setActive] = useState<string>("producer");

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold">Smart Food Redistribution</h1>
          <p className="text-sm text-muted-foreground">Producer → Supermarket → Local Market</p>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Tabs value={active} onValueChange={setActive} className="w-full">
          <TabsList className="grid grid-cols-3 max-w-2xl mx-auto mb-6">
            <TabsTrigger value="producer">Producer</TabsTrigger>
            <TabsTrigger value="supermarket">Supermarket</TabsTrigger>
            <TabsTrigger value="localmarket">Local Market</TabsTrigger>
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
