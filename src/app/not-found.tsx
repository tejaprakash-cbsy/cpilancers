import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { FileQuestion, Home, Search } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 bg-slate-50">
      <Card className="max-w-md w-full">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center text-center space-y-6">
            <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center">
              <FileQuestion className="w-8 h-8 text-blue-600" />
            </div>

            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-slate-900">Page not found</h1>
              <p className="text-sm text-slate-600">
                The page you&rsquo;re looking for doesn&rsquo;t exist or has been moved.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 w-full">
              <Link href="/" className="flex-1">
                <Button variant="primary" leftIcon={<Home className="w-4 h-4" />} className="w-full">
                  Go Home
                </Button>
              </Link>
              <Link href="/jobs" className="flex-1">
                <Button variant="outline" leftIcon={<Search className="w-4 h-4" />} className="w-full">
                  Browse Jobs
                </Button>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
