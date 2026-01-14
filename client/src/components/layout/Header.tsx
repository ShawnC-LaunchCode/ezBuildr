import { Menu } from "lucide-react";
import React, { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";

import logo from "@/assets/images/logo.png";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";



interface HeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

export default function Header({ title, description, actions }: HeaderProps) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await logout();
      toast({
        title: 'Signed Out',
        description: 'You have been successfully signed out.',
      });
      setMobileMenuOpen(false);
    } catch (error) {
      console.error('Logout error:', error);
      toast({
        title: 'Logout Error',
        description: 'There was an error signing out. Please try again.',
        variant: 'destructive',
      });
    }
  };

  // Check if user is admin
  const isAdmin = (user as any)?.role === 'admin';

  const navigation = [
    { name: "Dashboard", href: "/", icon: "fas fa-home" },
    { name: "Workflows", href: "/surveys", icon: "fas fa-list-ul" },
    { name: "Templates", href: "/templates", icon: "fas fa-puzzle-piece" },
  ];

  const adminNavigation = [
    { name: "Admin Dashboard", href: "/admin", icon: "fas fa-shield-alt" },
    { name: "Manage Users", href: "/admin/users", icon: "fas fa-users-cog" },
    { name: "Activity Logs", href: "/admin/logs", icon: "fas fa-clipboard-list" },
  ];

  const isActive = (href: string) => {
    if (href === "/") {
      return location === "/";
    }
    // For admin routes, check for exact match to avoid highlighting both
    if (href === "/admin") {
      return location === "/admin";
    }
    return location.startsWith(href);
  };

  return (
    <header className="bg-card border-b border-border px-4 sm:px-6 py-3 sm:py-4" data-testid="header">
      <div className="flex items-center justify-between gap-3">
        {/* Mobile Menu Button */}
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="sm" className="md:hidden p-2" data-testid="mobile-menu-button">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Open menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[280px] sm:w-[320px] p-0">
            <div className="flex flex-col h-full">
              <SheetHeader className="p-6 border-b border-border">
                <div className="flex items-center space-x-3">
                  <img
                    src={logo}
                    alt="Workflow App Logo"
                    className="w-8 h-8 rounded-lg object-cover"
                  />
                  <SheetTitle className="text-xl font-bold">ezBuildr</SheetTitle>
                </div>
              </SheetHeader>

              <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
                {navigation.map((item) => (
                  <Link key={item.name} href={item.href}>
                    <div
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors cursor-pointer ${isActive(item.href)
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent"
                        }`}
                    >
                      <i className={`${item.icon} w-5`}></i>
                      <span className="font-medium">{item.name}</span>
                    </div>
                  </Link>
                ))}

                {/* Admin Section */}
                {isAdmin && (
                  <>
                    <div className="pt-4 pb-2">
                      <div className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Administration
                      </div>
                    </div>
                    {adminNavigation.map((item) => (
                      <Link key={item.name} href={item.href}>
                        <div
                          onClick={() => setMobileMenuOpen(false)}
                          className={`flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors cursor-pointer ${isActive(item.href)
                            ? "bg-purple-600 text-white"
                            : "text-muted-foreground hover:text-foreground hover:bg-purple-50"
                            }`}
                        >
                          <i className={`${item.icon} w-5`}></i>
                          <span className="font-medium">{item.name}</span>
                        </div>
                      </Link>
                    ))}
                  </>
                )}
              </nav>

              <div className="p-4 border-t border-border">
                <div className="flex flex-col space-y-3">
                  <div className="flex items-center space-x-3">
                    {user?.profileImageUrl ? (
                      <img
                        src={user.profileImageUrl}
                        alt="User profile"
                        className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                        <i className="fas fa-user text-primary"></i>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {user?.firstName || user?.lastName
                          ? `${user.firstName || ""} ${user.lastName || ""}`.trim()
                          : user?.email || "User"
                        }
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {user?.email || ""}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleLogout}
                    className="w-full flex items-center justify-center space-x-2"
                  >
                    <i className="fas fa-sign-out-alt text-sm"></i>
                    <span className="text-sm">Logout</span>
                  </Button>
                </div>
              </div>
            </div>
          </SheetContent>
        </Sheet>

        {/* Header Title */}
        <div className="flex-1 min-w-0">
          <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-foreground truncate" data-testid="text-header-title">
            {title}
          </h1>
          {description && (
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 sm:mt-1 line-clamp-1 sm:line-clamp-none" data-testid="text-header-description">
              {description}
            </p>
          )}
        </div>

        {/* Header Actions */}
        {actions && (
          <div className="flex items-center space-x-2 sm:space-x-3 flex-shrink-0" data-testid="header-actions">
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}
