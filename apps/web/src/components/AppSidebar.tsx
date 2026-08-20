"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { logout } from "@/app/login/actions";

type AppSidebarProps = {
  userName: string;
  organizationName: string;
  canManage: boolean;
};

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "US";
}

export function AppSidebar({ userName, organizationName, canManage }: AppSidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem("kavro-sidebar-collapsed");
    if (stored === "1") setCollapsed(true);
  }, []);

  // Fecha o drawer mobile automaticamente sempre que a rota muda (ex.: após
  // clicar em um link de navegação), evitando que o menu fique aberto por cima do conteúdo.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem("kavro-sidebar-collapsed", next ? "1" : "0");
      return next;
    });
  };

  const isActive = (href: string) => pathname === href;
  const closeMobileMenu = () => setMobileOpen(false);

  return (
    <>
      <button
        type="button"
        className="mobile-menu-toggle"
        onClick={() => setMobileOpen((current) => !current)}
        aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}
        aria-expanded={mobileOpen}
      >
        {mobileOpen ? "✕" : "☰"}
      </button>
      {mobileOpen ? <div className="sidebar-overlay" onClick={closeMobileMenu} aria-hidden="true" /> : null}
      <aside className={`sidebar${collapsed ? " sidebar-collapsed" : ""}${mobileOpen ? " sidebar-mobile-open" : ""}`}>
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
          <Link className={isActive("/app") ? "active" : ""} href="/app" onClick={closeMobileMenu}>▦ <span>Visão geral</span></Link>
          <Link className={isActive("/app/pipeline") ? "active" : ""} href="/app/pipeline" onClick={closeMobileMenu}>◫ <span>Pipeline</span></Link>
          <Link className={isActive("/app/leads") ? "active" : ""} href="/app/leads" onClick={closeMobileMenu}>☰ <span>Leads</span></Link>
          <Link className={isActive("/app/whatsapp") ? "active" : ""} href="/app/whatsapp" onClick={closeMobileMenu}>◌ <span>Conversas</span></Link>
          <Link className={pathname.startsWith("/app/relatorios") ? "active" : ""} href="/app/relatorios" onClick={closeMobileMenu}>▤ <span>Relatórios</span></Link>
          <Link className={pathname.startsWith("/app/conteudo") ? "active" : ""} href="/app/conteudo" onClick={closeMobileMenu}>✎ <span>Conteúdo</span></Link>
          {canManage ? <Link className={pathname.startsWith("/app/criativos") ? "active" : ""} href="/app/criativos" onClick={closeMobileMenu}>◈ <span>Criativos</span></Link> : null}
        </nav>
        <div className="sidebar-footer">
          {canManage ? <Link className={isActive("/app/team") ? "active" : ""} href="/app/team" onClick={closeMobileMenu}>♙ <span>Equipe</span></Link> : null}
          <div className="profile"><span>{initials(userName)}</span>{!collapsed ? <div><strong>{userName}</strong><small>{organizationName}</small></div> : null}</div>
          <form action={logout}><button className="logout-button" type="submit">{collapsed ? "⏻" : "Sair da conta"}</button></form>
        </div>
      </aside>
    </>
  );
}
