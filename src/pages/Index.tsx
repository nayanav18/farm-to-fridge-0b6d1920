import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Leaf } from "lucide-react";
import ProducerDashboard from "@/components/ProducerDashboard";
import SupermarketDashboard from "@/components/SupermarketDashboard";
import LocalMarketDashboard from "@/components/LocalMarketDashboard";

const Index = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/20 to-accent/5">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 p-2 rounded-lg">
              <Leaf className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Smart Food Redistribution</h1>
              <p className="text-sm text-muted-foreground">Producer → Supermarket → Local Market</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <Tabs defaultValue="producer" className="w-full">
          <TabsList className="grid w-full max-w-2xl mx-auto grid-cols-3 mb-8 bg-card border border-border">
            <TabsTrigger value="producer" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              Producer
            </TabsTrigger>
            <TabsTrigger value="supermarket" className="data-[state=active]:bg-secondary data-[state=active]:text-secondary-foreground">
              Supermarket
            </TabsTrigger>
            <TabsTrigger value="localmarket" className="data-[state=active]:bg-accent data-[state=active]:text-accent-foreground">
              Local Market
            </TabsTrigger>
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