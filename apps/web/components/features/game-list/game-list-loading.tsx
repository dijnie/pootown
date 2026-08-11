import { Card, CardContent } from "@/components/ui/card";

export function GameListLoading() {
  return (
    <div className="space-y-4">
      {[...Array(5)].map((_, i) => (
        <Card key={i} className="animate-pulse">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="flex -space-x-2">
                  <div className="w-12 h-12 bg-gray-300 rounded-full"></div>
                  <div className="w-12 h-12 bg-gray-300 rounded-full"></div>
                </div>
                <div className="w-8 h-4 bg-gray-300 rounded"></div>
                <div className="w-16 h-6 bg-gray-300 rounded"></div>
                <div className="w-20 h-6 bg-gray-300 rounded"></div>
              </div>
              <div className="flex items-center space-x-3">
                <div className="w-24 h-10 bg-gray-300 rounded"></div>
                <div className="w-10 h-10 bg-gray-300 rounded"></div>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-black">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="w-20 h-4 bg-gray-300 rounded"></div>
                  <div className="w-24 h-4 bg-gray-300 rounded"></div>
                </div>
                <div className="w-32 h-4 bg-gray-300 rounded"></div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
