# Dator ERP v2.0 — Guia de Configuração

## Pré-requisitos

- Node.js 18+ (https://nodejs.org)
- Python 3.11+ (https://python.org)
- Conta no Supabase (https://supabase.com) — gratuito para começar

---

## 1. Configurar o Supabase

1. Crie um projeto em https://supabase.com/dashboard
2. No painel do projeto, vá em **SQL Editor**
3. Execute os arquivos em ordem:
   - `supabase/migrations/001_initial_schema.sql`
   - `supabase/migrations/002_rls_policies.sql`
4. No painel, vá em **Project Settings > API**
5. Copie: **URL**, **anon key**, **service_role key**

---

## 2. Configurar o Backend

```bash
cd backend
copy .env.example .env
```

Edite `backend/.env`:
```
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_ANON_KEY=sua-anon-key
SUPABASE_SERVICE_KEY=sua-service-role-key
FRONTEND_URL=http://localhost:5173
```

---

## 3. Criar a Primeira Empresa e Usuário

No Supabase SQL Editor, execute:

```sql
-- 1. Criar o tenant (empresa)
INSERT INTO tenants (id, name, app_name, cnpj)
VALUES (
  gen_random_uuid(),
  'Lyon Copos Personalizados',   -- Nome da empresa
  'Lyon ERP',                    -- Nome do sistema
  '00.000.000/0001-00'           -- CNPJ
) RETURNING id;

-- 2. Criar usuário admin no Supabase Auth
-- Vá em Authentication > Users > Add User
-- Email: admin@lyoncopos.com.br
-- Senha: senha-segura-aqui

-- 3. Criar perfil do usuário (substitua os UUIDs)
INSERT INTO user_profiles (id, tenant_id, name, email, role)
VALUES (
  'UUID-DO-USUARIO-CRIADO',   -- UUID do usuário criado no Auth
  'UUID-DO-TENANT',           -- UUID do tenant criado acima
  'Administrador',
  'admin@lyoncopos.com.br',
  'admin'
);
```

---

## 4. Iniciar o Sistema

### Opção A: Script automático (Windows)
```
Clique duas vezes em: start.bat
```

### Opção B: Manual
```bash
# Terminal 1 — Backend
cd backend
npm install
npm run dev

# Terminal 2 — Frontend
cd frontend
npm install
npm run dev
```

Acesse: **http://localhost:5173**

---

## 5. Configurar Python (NF-e e Relatórios)

```bash
cd python
pip install -r requirements.txt
```

Adicione no `backend/.env`:
```
PYTHON_PATH=python
```

---

## Estrutura do Sistema

```
ERP Sistema Comercio/
├── backend/        Node.js + Express API
├── frontend/       React + Vite + TailwindCSS
├── python/         NF-e + Relatórios PDF
├── supabase/       Schema do banco de dados
└── start.bat       Script de inicialização
```

## Módulos Disponíveis

| Módulo | Status |
|--------|--------|
| Dashboard com gráficos | ✅ |
| PDV / Frente de Caixa | ✅ |
| Pedidos de Venda | ✅ |
| Compras | ✅ |
| Estoque (posição + movimentações) | ✅ |
| Produtos | ✅ |
| Clientes | ✅ |
| Fornecedores | ✅ |
| Financeiro (a pagar/receber) | ✅ |
| Relatórios | ✅ |
| Configurações multi-tenant | ✅ |
| NF-e (requer certificado A1) | 🔧 Em configuração |
| Impressão de etiquetas | 🔜 Em breve |
| App mobile | 🔜 Futuro |
