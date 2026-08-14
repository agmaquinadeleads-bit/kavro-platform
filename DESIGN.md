# DESIGN.md — Design System

**Data:** 13 de agosto de 2026  
**Responsável:** Agente `designer`  
**Referências:** Linear, Attio, Notion

---

## FILOSOFIA

**Kavro é uma ferramenta profissional**, não consumer app.

### Princípios

1. **Denso de informação** — Muitos dados visíveis, sem waste de espaço
2. **Limpo** — Sem chrome desnecessário, uso espaço em branco estrategicamente
3. **Eficiente** — Menos cliques para ação, keyboard shortcuts
4. **Consistente** — Mesmo padrão em todas as telas
5. **Acessível** — WCAG 2.1 AA minimum (contraste 4.5:1)

### Referências Visuais
- **Linear** (issue tracking, clean) → espaçamento, tipografia
- **Attio** (CRM, dense) → card design, data display
- **Notion** (database) → database UI, kanban

---

## TIPOGRAFIA

### Familia

```css
/* Sans-serif: System fonts (carregam na máquina do usuário) */
font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, 
             "Helvetica Neue", sans-serif;

/* Monospace: Código, timestamps, IDs */
font-family: "JetBrains Mono", Monaco, "Courier New", monospace;
```

### Scale (Major Third: 1.2x ratio)

```
h1:  32px (2rem)   | 600 weight | line-height 1.2 | margin-bottom 16px
h2:  24px (1.5rem) | 600 weight | line-height 1.25 | margin-bottom 12px
h3:  20px (1.25rem)| 600 weight | line-height 1.3 | margin-bottom 12px
body: 14px (0.875rem) | 400 weight | line-height 1.5
label: 12px (0.75rem) | 500 weight | line-height 1.4 (caps OK)
small: 12px | 400 weight | color muted
```

### Font Weight

```
400 — Regular (body, descriptions)
500 — Medium (labels, tags)
600 — Semibold (headings, emphasis)
700 — Bold (headlines, heroic)
```

**Nunca use:**
- 300 (Light) — Baixo contraste
- 800+ (Extra bold) — Muito pesado

---

## CORES

### Sistema de Cores (Light mode base)

```css
/* Primária (Action, Brand) */
--color-primary-50:  #EFF6FF
--color-primary-100: #DBEAFE
--color-primary-500: #0066FF  ← USE
--color-primary-600: #004ECC
--color-primary-700: #003399
--color-primary-900: #001A4D

/* Sucesso (Positivo, Ganhado) */
--color-success-50:  #F0FDF4
--color-success-500: #10B981  ← USE
--color-success-600: #059669
--color-success-900: #065F46

/* Aviso (Atenção, Agendado) */
--color-warning-50:  #FFFBEB
--color-warning-500: #F59E0B  ← USE
--color-warning-600: #D97706
--color-warning-900: #78350F

/* Erro (Deletar, Perdido, Bloqueado) */
--color-error-50:   #FEF2F2
--color-error-500:  #EF4444  ← USE
--color-error-600:  #DC2626
--color-error-900:  #7F1D1D

/* Neutro (Texto, Bg, Border) */
--color-gray-0:     #FFFFFF
--color-gray-50:    #F9FAFB
--color-gray-100:   #F3F4F6
--color-gray-200:   #E5E7EB
--color-gray-300:   #D1D5DB
--color-gray-400:   #9CA3AF
--color-gray-500:   #6B7280
--color-gray-600:   #4B5563  ← Text primary
--color-gray-700:   #374151
--color-gray-800:   #1F2937  ← Text dark
--color-gray-900:   #111827
```

### Uso de Cores

| Elemento | Cor | Quando |
|----------|-----|--------|
| **Botão principal** | Primary-500 | CTA primária (criar, enviar) |
| **Botão secundário** | Gray-200 border | Ação secundária |
| **Link** | Primary-600 | Navegação |
| **Sucesso/Ganho** | Success-500 | Lead fechado, tarefa completa |
| **Aviso/Agendado** | Warning-500 | Follow-up próximo, importante |
| **Erro/Perdido** | Error-500 | Lead perdido, deletado, bloqueado |
| **Texto** | Gray-800 | Corpo de texto |
| **Texto muted** | Gray-500 | Secondary, timestamp, descrição |
| **Border** | Gray-200 | Separadores, input border |
| **Background** | White/Gray-50 | Card, section |

### Dark Mode (Futuro)

```css
/* Inverter paleta */
--color-gray-0:     #1F2937  /* foi gray-800 */
--color-gray-900:   #FFFFFF  /* foi white */
/* ... etc */
```

**CSS Pattern:**
```css
:root {
  --text-primary: #1F2937;
  --text-secondary: #6B7280;
  --bg-primary: #FFFFFF;
  --border-color: #E5E7EB;
}

@media (prefers-color-scheme: dark) {
  :root {
    --text-primary: #F9FAFB;
    --text-secondary: #D1D5DB;
    --bg-primary: #111827;
    --border-color: #374151;
  }
}
```

---

## ESPAÇAMENTO

### Scale (4px base unit)

```
4px   (xs)   — Micro spacing (icon padding)
8px   (sm)   — Tight (button internal)
12px  (md)   — Standard (section padding)
16px  (lg)   — Comfortable (card padding)
24px  (xl)   — Generous (section gap)
32px  (2xl)  — Large (major sections)
```

### Regras de Uso

| Contexto | Spacing |
|----------|---------|
| Button padding (horizontal) | 12px |
| Button padding (vertical) | 8px |
| Input padding | 10px |
| Card padding | 16px |
| Card title margin-bottom | 12px |
| Section gap (entre cards) | 16px-24px |
| Major sections (diferentes áreas) | 32px+ |
| List item height | 44px (min) |
| Modal padding | 24px |

---

## COMPONENTES

### Button

**Variantes:**

```
PRIMARY (Fill)
  ├─ Background: Primary-500
  ├─ Text: White
  ├─ Hover: Primary-600 (darker)
  ├─ Disabled: 50% opacity, cursor not-allowed
  └─ Padding: 10px 14px

SECONDARY (Outline)
  ├─ Border: 1px Gray-300
  ├─ Background: Transparent
  ├─ Text: Gray-800
  ├─ Hover: Background Gray-50
  └─ Padding: 10px 14px

TERTIARY (Ghost)
  ├─ No border, no background
  ├─ Text: Primary-600
  ├─ Hover: Background Gray-50
  └─ Padding: 10px 14px

DANGER (Delete)
  ├─ Background: Error-500
  ├─ Text: White
  ├─ Hover: Error-600
  └─ Padding: 10px 14px
```

**Tamanhos:**
- Small (12px text) — inline actions
- Normal (14px text) — standard
- Large (16px text) — heroic CTAs

---

### Input & Form

**Input (text, email, number):**
```
Border: 1px Gray-200
Focus: Border Primary-500, outline none, shadow 0 0 0 3px Primary-50
Background: White
Padding: 10px 12px
Height: 40px (min)
Font: 14px
Disabled: Background Gray-50, cursor not-allowed
Error: Border Error-500, error-message in Error-500 12px
```

**Select (dropdown):**
```
Same as input
Chevron icon (right 12px, Gray-400)
```

**Textarea:**
```
Same as input
Min height: 80px
Resize: vertical only
```

**Checkbox & Radio:**
```
Size: 16px
Checked: Primary-500 background, white checkmark
Unchecked: Gray-200 border
Label: 14px, Gray-800
```

---

### Table (Lead list)

**Structure:**
```
Header row (background Gray-100):
  ├─ Checkbox (select all)
  ├─ Name
  ├─ Email
  ├─ Stage
  ├─ Value
  └─ Actions (3-dot menu)

Data row:
  ├─ Height: 44px
  ├─ Hover: Background Gray-50
  ├─ Border: 1px Gray-200
  ├─ Cell padding: 12px
  └─ Text: 14px, Gray-800

Sorted column:
  ├─ Seta pequena (chevron up/down)
  ├─ Primary-600
  ├─ Bold heading
```

**Rowactions (3-dot):**
```
Hover: Show actions (view, edit, delete)
Click: Popover menu, Gray-100 background
```

---

### Modal/Dialog

**Anatomy:**
```
Overlay:
  ├─ Background: rgba(0, 0, 0, 0.2)
  ├─ Backdrop filter: blur(2px)
  └─ Z-index: 1000

Card:
  ├─ Background: White (Gray-0)
  ├─ Border-radius: 8px
  ├─ Box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1)
  ├─ Max-width: 500px (standard) / 700px (wide)
  ├─ Padding: 24px
  ├─ Header: Title (h2) + close button
  ├─ Body: Content (14px, Gray-800)
  └─ Footer: Buttons (primary right, secondary left)

Animation:
  ├─ Appear: Scale 0.9 → 1.0 (300ms cubic-bezier)
  └─ Dismiss: Fade out (200ms)
```

---

### Alert/Toast

**Anatomy (Top-right):**

```
SUCCESS (Green)
  ├─ Background: Success-50
  ├─ Border-left: 4px Success-500
  ├─ Icon: checkmark circle
  ├─ Text: Success-900 (14px)
  ├─ Padding: 12px 16px
  ├─ Dismiss: X button (Gray-400)
  └─ Auto-dismiss: 4s

ERROR (Red)
  ├─ Background: Error-50
  ├─ Border-left: 4px Error-500
  ├─ Icon: x circle
  ├─ Text: Error-900 (14px)
  └─ Auto-dismiss: 6s (more persistent)

WARNING (Yellow)
  ├─ Background: Warning-50
  ├─ Border-left: 4px Warning-500
  ├─ Icon: alert circle
  └─ Auto-dismiss: 5s
```

**Stacking:** Max 3 toasts (oldest auto-dismiss)

---

### Badge/Tag

**Anatomy:**
```
Background: Primary-100
Text: Primary-700 (12px, 500 weight)
Padding: 4px 8px
Border-radius: 4px (pill: 100px)
```

**Variantes:**
- Primary: Action, featured
- Success: Completed, won
- Warning: Pending, scheduled
- Error: Blocked, lost
- Gray: Neutral, muted

---

## ESTADOS & FEEDBACK

### Empty State

**Pattern:**
```
1. Ícone grande (64px) — Illustrative (não emoji)
2. Heading (h3) — "Nenhum lead criado"
3. Description (14px, Gray-500) — "Comece criando o primeiro lead"
4. CTA Button — "Criar lead" (Primary)
5. Suggestão (small, Gray-400) — "Ou importe uma lista"
```

**Placement:** Vertically centered, 100% width

**Exemplo:**
```
  📋 (illustration)
  
  Nenhum lead criado
  
  Comece adicionando o primeiro contato ou
  importe uma lista de contatos em CSV.
  
  [Criar lead]        [Importar CSV]
```

---

### Loading State

**Pattern:**
```
Spinner: 3s rotation (infinite)
Animation: cubic-bezier(0.68, -0.55, 0.265, 1.55)
Color: Primary-500
Size: 24px (standard) / 16px (inline)

Text (optional): "Carregando..." (Gray-600, 14px)

Placement: Center of container, skip content
```

---

### Error State

**Pattern:**
```
Background: Error-50 (light red)
Border-left: 4px Error-500
Icon: ⚠️ (16px)
Heading: "Algo deu errado" (Gray-900, 14px bold)
Message: "Descrição do erro em português" (Gray-700, 13px)
CTA: Retry button (secondary)
```

**Nunca:** Mostrar erro técnico (ex: "Error: ECONNREFUSED")  
**Sempre:** Mensagem amigável do usuário

---

### Success State

**Pattern:**
```
Toast com checkmark verde
Message: "Lead criado com sucesso"
Auto-dismiss: 4s
Optional: Undo button (secondary)
```

---

## ACESSIBILIDADE

### WCAG 2.1 AA Compliance

- [ ] **Contraste:** 4.5:1 para texto (test com WebAIM)
- [ ] **Keyboard nav:** Tab, Shift+Tab, Enter, Escape
- [ ] **ARIA labels:** Em inputs sem label visível (`aria-label="search"`)
- [ ] **Sem cores apenas:** Sempre usar ícone + cor
- [ ] **Focus visible:** Outline azul em foco (não remover)
- [ ] **Alt text:** Em imagens relevantes (não em decorativas)
- [ ] **Skip links:** "Pular para conteúdo" em homepage
- [ ] **Estrutura semântica:** H1 > H2 > H3 (não pular níveis)

### Teste Rápido

```bash
# Usar Lighthouse (Chrome DevTools)
# Score mínimo: 90

# Ou axe DevTools (browser extension)
```

---

## PADRÃO DE DARK MODE (Futuro)

**Estratégia:** CSS variables + `prefers-color-scheme`

```css
:root {
  /* Light (default) */
  --bg-primary: #FFFFFF;
  --text-primary: #1F2937;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg-primary: #111827;
    --text-primary: #F9FAFB;
  }
}
```

**Não:** Tema toggle em UI (ainda não)

---

## ÍCONES

**Fonte:** Feather Icons (24px standard)
```
Create: +
Edit: pencil
Delete: trash
Send: send
Search: search
Menu: menu
Close: x
Checkbox: check-square
Loading: loader
Alert: alert-circle
Success: check-circle
Error: x-circle
```

**Sempre:** Stroke 2, Grey-600 (cor alterna por contexto)

---

## REFERÊNCIA RÁPIDA

### Cores para Estado de Lead

```
Novo:          Gray-400
Em Contato:    Primary-500
Qualificado:   Warning-500
Ganho:         Success-500
Perdido:       Error-500
Arquivado:     Gray-300 (strikethrough)
```

### Componentes Reutilizáveis

Criar em `apps/web/src/components/`:
- `Button.tsx`
- `Input.tsx`
- `Modal.tsx`
- `Alert.tsx`
- `Table.tsx`
- `Badge.tsx`
- `EmptyState.tsx`
- `LoadingSpinner.tsx`

**Padrão:** Props com `variant`, `size`, `disabled`, etc.

---

## Validação de Consistência

Antes de mergear UI nova:

- [ ] Cores usam a paleta (sem hex #custom)
- [ ] Espaçamento usa scale (4px, 8px, 12px...)
- [ ] Typography usa definições acima
- [ ] Accessibility checklist OK (contraste, keyboard)
- [ ] Componente é reutilizável (não one-off)
- [ ] Responsive (mobile 375px até desktop 1440px)
- [ ] Dark mode compatível (vars adicionadas)

---

**Responsável:** Agente Designer  
**Última revisão:** 13 de agosto de 2026
