import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { FullPageLoader } from "@/components/ui/loader";

import Dashboard from "@/pages/dashboard";
import Login from "@/pages/login";
import NotFound from "@/pages/not-found";
import Feature1 from "@/pages/feature1";
import Feature2 from "@/pages/feature2";
import DbUpdate from "@/pages/db-update";
import DbView from "@/pages/db-view";
import LicenseIssue from "@/pages/admin/license-issue";
import LicenseManage from "@/pages/admin/license-manage";
import AccessLog from "@/pages/admin/access-log";
import Security from "@/pages/admin/security";

const queryClient = new QueryClient();

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { data, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  if (isLoading) return <FullPageLoader />;

  if (!data?.user) {
    setTimeout(() => setLocation("/login"), 0);
    return <FullPageLoader />;
  }

  return <Component />;
}

function AdminRoute({ component: Component }: { component: React.ComponentType }) {
  const { data, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  if (isLoading) return <FullPageLoader />;

  if (!data?.user) {
    setTimeout(() => setLocation("/login"), 0);
    return <FullPageLoader />;
  }

  if (data.user.role !== "admin") {
    setTimeout(() => setLocation("/"), 0);
    return <FullPageLoader />;
  }

  return <Component />;
}

function PublicRoute({ component: Component }: { component: React.ComponentType }) {
  const { data, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  if (isLoading) return <FullPageLoader />;

  if (data?.user) {
    setTimeout(() => setLocation("/"), 0);
    return null;
  }

  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login">
        <PublicRoute component={Login} />
      </Route>
      <Route path="/">
        <ProtectedRoute component={Dashboard} />
      </Route>
      <Route path="/feature1">
        <ProtectedRoute component={Feature1} />
      </Route>
      <Route path="/feature2">
        <ProtectedRoute component={Feature2} />
      </Route>
      <Route path="/db-update">
        <ProtectedRoute component={DbUpdate} />
      </Route>
      <Route path="/db-view">
        <ProtectedRoute component={DbView} />
      </Route>
      <Route path="/admin/license-issue">
        <AdminRoute component={LicenseIssue} />
      </Route>
      <Route path="/admin/license-manage">
        <AdminRoute component={LicenseManage} />
      </Route>
      <Route path="/admin/access-log">
        <AdminRoute component={AccessLog} />
      </Route>
      <Route path="/admin/security">
        <AdminRoute component={Security} />
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="min-h-screen bg-background text-foreground antialiased">
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </div>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
