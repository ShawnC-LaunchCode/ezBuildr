/**
 * CollectionsDrawer - Configuration drawer for Collections data source
 * PR6: Stub implementation for Collections configuration
 */

import { useState } from "react";
import { Database, Plus, Trash2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Collection {
  id: string;
  name: string;
  key: string;
  recordCount: number;
}

interface CollectionsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflowId: string;
}

export function CollectionsDrawer({ open, onOpenChange, workflowId }: CollectionsDrawerProps) {
  const { toast } = useToast();
  const [collections, setCollections] = useState<Collection[]>([
    {
      id: "1",
      name: "Customers",
      key: "customers",
      recordCount: 42,
    },
    {
      id: "2",
      name: "Products",
      key: "products",
      recordCount: 156,
    },
  ]);

  const [newCollectionName, setNewCollectionName] = useState("");
  const [selectedCollection, setSelectedCollection] = useState<string>("");

  // Stub: Create new collection
  const handleCreateCollection = () => {
    if (!newCollectionName) {
      toast({
        title: "Validation Error",
        description: "Please enter a collection name",
        variant: "destructive",
      });
      return;
    }

    // Stub implementation
    console.log("Creating collection:", newCollectionName);

    toast({
      title: "Coming Soon",
      description: `Collection "${newCollectionName}" creation will be implemented soon`,
    });

    setNewCollectionName("");
  };

  // Stub: Delete collection
  const handleDeleteCollection = (id: string, name: string) => {
    console.log("Deleting collection:", id);

    toast({
      title: "Success",
      description: `Collection "${name}" removed`,
    });

    setCollections(collections.filter(c => c.id !== id));
  };

  // Stub: Link collection to workflow
  const handleLinkCollection = () => {
    if (!selectedCollection) {
      toast({
        title: "Validation Error",
        description: "Please select a collection",
        variant: "destructive",
      });
      return;
    }

    const collection = collections.find(c => c.id === selectedCollection);

    console.log("Linking collection to workflow:", { workflowId, collectionId: selectedCollection });

    toast({
      title: "Coming Soon",
      description: `Linking collection "${collection?.name}" will be implemented soon`,
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-primary" />
            <SheetTitle>Collections Configuration</SheetTitle>
          </div>
          <SheetDescription>
            Manage data collections for this workflow. Collections store structured data
            that can be used for prefilling, validation, and data lookups.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 py-6">
          {/* Link Existing Collection Section */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Link Existing Collection</h3>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="collection">Select Collection</Label>
                <Select value={selectedCollection} onValueChange={setSelectedCollection}>
                  <SelectTrigger id="collection">
                    <SelectValue placeholder="Choose a collection..." />
                  </SelectTrigger>
                  <SelectContent>
                    {collections.map((collection) => (
                      <SelectItem key={collection.id} value={collection.id}>
                        {collection.name} ({collection.recordCount} records)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button onClick={handleLinkCollection} className="w-full">
                Link Collection
              </Button>
            </div>
          </div>

          {/* Create New Collection Section */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Create New Collection</h3>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="new-collection">Collection Name</Label>
                <Input
                  id="new-collection"
                  placeholder="e.g., Customers, Orders, Inventory"
                  value={newCollectionName}
                  onChange={(e) => setNewCollectionName(e.target.value)}
                />
              </div>

              <Button onClick={handleCreateCollection} variant="outline" className="w-full">
                <Plus className="w-4 h-4 mr-2" />
                Create Collection
              </Button>
            </div>
          </div>

          {/* Available Collections */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Available Collections</h3>
            <div className="space-y-2">
              {collections.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No collections yet. Create your first collection above.
                </p>
              ) : (
                collections.map((collection) => (
                  <Card key={collection.id}>
                    <CardHeader className="py-3 px-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-sm">{collection.name}</CardTitle>
                          <CardDescription className="text-xs">
                            <code className="text-xs">{collection.key}</code>
                          </CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">
                            {collection.recordCount} records
                          </Badge>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteCollection(collection.id, collection.name)}
                          >
                            <Trash2 className="w-3 h-3 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                  </Card>
                ))
              )}
            </div>
          </div>

          {/* Info Box */}
          <div className="p-4 bg-muted/50 rounded-lg border border-border">
            <h4 className="text-sm font-semibold mb-2">About Collections</h4>
            <p className="text-xs text-muted-foreground">
              Collections are data stores that can hold structured records. Use them to:
            </p>
            <ul className="text-xs text-muted-foreground mt-2 space-y-1 list-disc list-inside">
              <li>Store workflow run data persistently</li>
              <li>Maintain reference data (products, customers, etc.)</li>
              <li>Query and filter records in workflow logic</li>
              <li>Export data to external systems</li>
            </ul>
          </div>
        </div>

        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
