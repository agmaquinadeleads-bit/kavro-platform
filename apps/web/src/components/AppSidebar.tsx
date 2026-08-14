"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { logout } from "@/app/login/actions";

type AppSidebarProps = {
  userName: string;
  organizationName: string;
  canSeeTeamTasks: boolean;
};

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "US";
}

export function AppSidebar({ userName, organizationName, canSeeTeamTasks }: AppSidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem("kavro-sidebar-collapsed");
    if (stored === "1") setCollapsed(true);
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem("kavro-sidebar-collapsed", next ? "1" : "0");
      return next;
    });
  };

  const isActive = (href: string) => pathname === href;

  return (
    <aside className={`sidebar${collapsed ? " sidebar-collapsed" : ""}`}>
      <div className="sidebar-top">
        <div className="brand"><span>K</span>{!collapsed ? "Kavro" : null}</div>
        <button
          type="button"
          className="sidebar-toggle"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          title={collapsed ? "Expandir menu" : "Recolher menu"}
        >
          {collapsed ? "»" : "«"}
        </button>
      </div>
      <nav aria-label="Navegação principal">
        <Link className={isActive("/app") ? "active" : ""} href="/app">▦ <span>Visão geral</span></Link>
        <Link href="/app#pipeline">◫ <span>Pipeline</span></Link>
        <Link className={isActive("/app/leads") ? "active" : ""} href="/app/leads">☰ <span>Leads</span></Link>
        <Link href="/app#new-lead">◎ <span>Novo lead</span></Link>
        <Link className={isActive("/app/whatsapp") ? "active" : ""} href="/app/whatsapp">◌ <span>Conversas</span></Link>
      </nav>
      <div className="sidebar-footer">
        {canSeeTeamTasks ? <Link className={isActive("/app/team") ? "active" : ""} href="/app/team">♙ <span>Equipe</span></Link> : null}
        <div className="profile"><span>{initials(userName)}</span>{!collapsed ? <div><strong>{userName}</strong><small>{organizationName}</small></div> : null}</div>
        <form action={logout}><button className="logout-button" type="submit">{collapsed ? "⏻" : "Sair da conta"}</button></form>
      </div>
    </aside>
  );
}
