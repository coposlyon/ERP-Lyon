# Estrutura do banco - ERP Lyon

Gerado do information_schema por `node backend/scripts/gerar-estrutura-banco.js`. Somente estrutura: nenhum dado, senha, token ou chave.

Gerado em 2026-09-15 · 117 tabelas · última migração aplicada: 125 (122 registradas).


## AGENDA_VENDEDOR

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL
- **user_id** uuid NOT NULL
- **kind** text NOT NULL default 'compromisso'::text
- **title** text NOT NULL
- **notes** text
- **customer_id** uuid -> CLIENTES
- **due_at** timestamp with time zone
- **done** boolean NOT NULL default false
- **done_at** timestamp with time zone
- **created_at** timestamp with time zone NOT NULL
- **updated_at** timestamp with time zone NOT NULL
- **end_at** timestamp with time zone
- **dia_inteiro** boolean NOT NULL default false
- **local** text
- **participantes** uuid[] NOT NULL default '{}'::uuid[]
- **da_empresa** boolean NOT NULL default false

## ALERTAS_PEDIDO

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL
- **sale_id** uuid NOT NULL -> VENDAS
- **area** text NOT NULL
- **stage** text
- **reason** text
- **raised_by** uuid
- **raised_name** text
- **resolved_at** timestamp with time zone
- **resolved_by** uuid
- **resolution** text
- **created_at** timestamp with time zone NOT NULL

## ARTES_PROMOCIONAIS

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL
- **title** text
- **image_url** text NOT NULL
- **product_id** uuid -> PRODUTOS
- **promo_id** uuid
- **is_active** boolean NOT NULL default true
- **created_by** uuid
- **created_at** timestamp with time zone NOT NULL

## AUDITORIA

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL
- **user_id** uuid
- **user_name** text
- **action** text NOT NULL
- **entity** text NOT NULL
- **entity_id** text
- **details** jsonb
- **created_at** timestamp with time zone

## BACKUPS

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL -> EMPRESAS
- **criado_em** timestamp with time zone NOT NULL
- **concluido_em** timestamp with time zone
- **origem** character varying NOT NULL default 'manual'::character varying
- **status** character varying NOT NULL default 'gerando'::character varying
- **arquivo** text
- **bytes** bigint
- **bytes_json** bigint
- **sha256** character varying
- **tabelas** integer
- **linhas** bigint
- **detalhes** jsonb NOT NULL default '{}'::jsonb
- **erro** text
- **usuario** character varying
- **user_id** uuid

## CADASTRO_SOLICITACOES

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL
- **entity** text NOT NULL
- **entity_id** uuid
- **doc_digits** text NOT NULL
- **entity_name** text
- **status** text NOT NULL default 'pendente'::text
- **payload** jsonb NOT NULL default '{}'::jsonb
- **changes** jsonb NOT NULL default '[]'::jsonb
- **attachments** jsonb NOT NULL default '[]'::jsonb
- **requested_by** jsonb NOT NULL default '{}'::jsonb
- **note** text
- **reviewed_by** uuid
- **reviewed_by_name** text
- **reviewed_at** timestamp with time zone
- **review_note** text
- **created_at** timestamp with time zone NOT NULL

## CAMPANHAS_MKT

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL
- **user_id** uuid
- **title** text
- **message** text
- **image_url** text
- **channels** jsonb default '[]'::jsonb
- **segment** jsonb default '{}'::jsonb
- **results** jsonb default '{}'::jsonb
- **status** text default 'sent'::text
- **created_at** timestamp with time zone

## CATALOGO_ARTES

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL -> EMPRESAS
- **codigo** text NOT NULL
- **name** text NOT NULL
- **ocasiao_id** uuid -> CATALOGO_OCASIOES
- **svg** text
- **thumb_url** text
- **elementos** jsonb NOT NULL default '[]'::jsonb
- **fontes** jsonb NOT NULL default '[]'::jsonb
- **familias** jsonb NOT NULL default '[]'::jsonb
- **seq** integer NOT NULL default 100
- **is_active** boolean NOT NULL default true
- **created_at** timestamp with time zone NOT NULL
- **updated_at** timestamp with time zone NOT NULL

## CATALOGO_EMBALAGEM

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL -> EMPRESAS
- **category_id** uuid -> CATEGORIAS
- **product_id** uuid -> PRODUTOS
- **caixa_qtd** integer NOT NULL default 100
- **max_cores_caixa** integer NOT NULL default 4
- **min_caixas** integer NOT NULL default 1
- **created_at** timestamp with time zone NOT NULL
- **updated_at** timestamp with time zone NOT NULL
- **caixa_altura** numeric
- **caixa_largura** numeric
- **caixa_comprimento** numeric
- **caixa_tara** numeric

## CATALOGO_FAMILIAS

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL -> EMPRESAS
- **name** text NOT NULL
- **slug** text NOT NULL
- **descricao** text
- **icone** text
- **seq** integer NOT NULL default 100
- **is_active** boolean NOT NULL default true
- **created_at** timestamp with time zone NOT NULL
- **updated_at** timestamp with time zone NOT NULL

## CATALOGO_FAMILIA_ITENS

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL -> EMPRESAS
- **familia_id** uuid NOT NULL -> CATALOGO_FAMILIAS
- **category_id** uuid -> CATEGORIAS
- **product_id** uuid -> PRODUTOS
- **seq** integer NOT NULL default 100
- **created_at** timestamp with time zone NOT NULL

## CATALOGO_GABARITOS

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL -> EMPRESAS
- **category_id** uuid -> CATEGORIAS
- **product_id** uuid -> PRODUTOS
- **altura_mm** numeric NOT NULL
- **largura_mm** numeric NOT NULL
- **margem_mm** numeric NOT NULL default 2
- **permite_verso** boolean NOT NULL default true
- **observacao** text
- **created_at** timestamp with time zone NOT NULL
- **updated_at** timestamp with time zone NOT NULL

## CATALOGO_OCASIOES

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL -> EMPRESAS
- **name** text NOT NULL
- **slug** text NOT NULL
- **icone** text
- **seq** integer NOT NULL default 100
- **destaque** boolean NOT NULL default false
- **is_active** boolean NOT NULL default true
- **created_at** timestamp with time zone NOT NULL

## CATALOGO_PROJETOS

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL -> EMPRESAS
- **visitor_id** text
- **customer_id** uuid -> CLIENTES
- **product_id** uuid -> PRODUTOS
- **arte_id** uuid -> CATALOGO_ARTES
- **posicao** text NOT NULL default 'frente'::text
- **gabarito** jsonb NOT NULL default '{}'::jsonb
- **faces** jsonb NOT NULL default '{}'::jsonb
- **preview_url** text
- **created_at** timestamp with time zone NOT NULL
- **updated_at** timestamp with time zone NOT NULL

## CATEGORIAS

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL -> EMPRESAS
- **name** character varying NOT NULL
- **parent_id** uuid -> CATEGORIAS
- **created_at** timestamp with time zone
- **nome_catalogo** text

## CENTROS_CUSTO

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL -> EMPRESAS
- **code** character varying
- **name** character varying NOT NULL
- **is_active** boolean default true
- **created_at** timestamp with time zone

## CHAT_LEITURAS

- **tenant_id** uuid NOT NULL -> EMPRESAS
- **user_id** uuid NOT NULL -> USUARIOS
- **canal** text NOT NULL default 'geral'::text
- **lido_ate** timestamp with time zone NOT NULL

## CHAT_MENSAGENS

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL -> EMPRESAS
- **canal** text NOT NULL default 'geral'::text
- **user_id** uuid -> USUARIOS
- **user_name** text
- **body** text NOT NULL
- **reply_to** uuid -> CHAT_MENSAGENS
- **mencionados** uuid[] NOT NULL default '{}'::uuid[]
- **deleted_at** timestamp with time zone
- **edited_at** timestamp with time zone
- **created_at** timestamp with time zone NOT NULL

## CLIENTES

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL -> EMPRESAS
- **type** character varying default 'PF'::character varying
- **name** character varying NOT NULL
- **cpf_cnpj** character varying
- **rg_ie** character varying
- **email** character varying
- **phone** character varying
- **mobile** character varying
- **address** jsonb default '{}'::jsonb
- **notes** text
- **credit_limit** numeric default 0
- **is_active** boolean default true
- **created_at** timestamp with time zone
- **display_id** bigint
- **instagram** text
- **nome_fantasia** text
- **rating** smallint
- **admission_data** jsonb default '{}'::jsonb
- **phone_digits** text
- **mobile_digits** text
- **doc_digits** text
- **birth_date** date
- **updated_at** timestamp with time zone
- **avatar_url** text
- **profile_history** jsonb default '[]'::jsonb
- **blocked** boolean default false
- **block_reason** text
- **total_12m** numeric default 0
- **vendedor** text
- **boleto_days** integer
- **selo_confianca** boolean NOT NULL default false
- **google_resource_name** text

## COMPRAS

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL -> EMPRESAS
- **number** integer NOT NULL
- **supplier_id** uuid -> FORNECEDORES
- **user_id** uuid -> USUARIOS
- **status** character varying default 'received'::character varying
- **subtotal** numeric default 0
- **discount** numeric default 0
- **total** numeric default 0
- **notes** text
- **invoice_number** character varying
- **invoice_key** character varying
- **created_at** timestamp with time zone
- **freight** numeric default 0

## COMPRA_ITENS

- **id** uuid NOT NULL
- **purchase_id** uuid NOT NULL -> COMPRAS
- **product_id** uuid
- **product_name** character varying
- **quantity** numeric NOT NULL
- **unit_price** numeric NOT NULL
- **total** numeric NOT NULL
- **created_at** timestamp with time zone

## CONFIG_ACABAMENTOS

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL -> EMPRESAS
- **name** text NOT NULL
- **seq** integer NOT NULL default 100
- **requer_pintura** boolean NOT NULL default false
- **requer_borda** boolean NOT NULL default false
- **requer_jateamento** boolean NOT NULL default false
- **campos** jsonb NOT NULL default '[]'::jsonb
- **is_active** boolean NOT NULL default true
- **created_at** timestamp with time zone NOT NULL
- **label_comercial** text
- **preco_adicional** numeric NOT NULL default 0
- **no_catalogo** boolean NOT NULL default true
- **preco_metodo** text
- **faixas** jsonb NOT NULL default '[]'::jsonb

## CONFIG_CORES

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL -> EMPRESAS
- **name** text NOT NULL
- **grupo** text NOT NULL
- **hex** text
- **insumo_id** uuid -> INSUMOS
- **seq** integer NOT NULL default 100
- **is_active** boolean NOT NULL default true
- **created_at** timestamp with time zone NOT NULL

## CONFIG_ESOCIAL

- **tenant_id** uuid NOT NULL
- **provider** text default 'tecnospeed'::text
- **provider_base_url** text
- **ambiente** text default 'restrita'::text
- **provider_token_restrita** text
- **provider_token_producao** text
- **provider_empregador_id** text
- **tp_insc** smallint default 1
- **nr_insc** text
- **razao_social** text
- **classif_trib** text
- **nat_jur** text
- **ind_coop** smallint default 0
- **ind_constr** smallint default 0
- **ind_desf** smallint default 0
- **ind_opc_cp** smallint
- **ind_porte** smallint
- **ind_opt_reg_eletron** smallint default 0
- **ind_ent_ed** smallint default 0
- **ind_ett** smallint default 0
- **nr_reg_ett** text
- **nm_ctt** text
- **cpf_ctt** text
- **fone_ctt** text
- **email_ctt** text
- **cnae_preponderante** text
- **aliq_rat** numeric
- **fap** numeric
- **ini_valid** text
- **updated_at** timestamp with time zone

## CONFIG_FISCAL

- **tenant_id** uuid NOT NULL
- **cnpj** text
- **razao_social** text
- **nome_fantasia** text
- **inscricao_estadual** text
- **inscricao_municipal** text
- **regime_tributario** text default 'simples'::text
- **logradouro** text
- **numero** text
- **complemento** text
- **bairro** text
- **municipio** text
- **uf** text
- **cep** text
- **codigo_municipio** text
- **telefone** text
- **ncm_padrao** text default '39241000'::text
- **cfop_interno** text default '5102'::text
- **cfop_interestadual** text default '6102'::text
- **csosn_padrao** text default '102'::text
- **cst_padrao** text default '00'::text
- **pis_cst** text default '49'::text
- **cofins_cst** text default '49'::text
- **natureza_operacao** text default 'Venda de mercadoria'::text
- **ambiente** text default 'homologacao'::text
- **focus_token_homologacao** text
- **focus_token_producao** text
- **updated_at** timestamp with time zone
- **aliquota_venda** numeric
- **recebidas_versao** bigint NOT NULL default 0
- **recebidas_sync_at** timestamp with time zone

## CONFIG_PROCESSOS

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL -> EMPRESAS
- **name** text NOT NULL
- **max_cores** integer
- **seq** integer NOT NULL default 100
- **is_active** boolean NOT NULL default true
- **created_at** timestamp with time zone NOT NULL
- **preco_adicional** numeric NOT NULL default 0
- **linha_tinta** text
- **preco_metodo** text
- **faixas** jsonb NOT NULL default '[]'::jsonb

## CONSULTAS_CREDITO

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL
- **customer_id** uuid
- **cpf_cnpj** text
- **provider** text
- **score** integer
- **score_faixa** text
- **negativado** boolean
- **total_restricoes** numeric
- **restricoes** jsonb
- **raw** jsonb
- **user_id** uuid
- **user_name** text
- **created_at** timestamp with time zone

## CONTABIL_EMPRESAS

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL -> EMPRESAS
- **razao_social** character varying NOT NULL
- **nome_fantasia** character varying
- **cnpj** character varying
- **regime** character varying default 'simples'::character varying
- **annual_limit** numeric default 4800000
- **aliquota** numeric default 4
- **cert_expiry** date
- **is_default** boolean NOT NULL default false
- **is_active** boolean NOT NULL default true
- **notes** text
- **created_at** timestamp with time zone
- **updated_at** timestamp with time zone

## CONTAS_BANCARIAS

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL -> EMPRESAS
- **name** character varying NOT NULL
- **bank_name** character varying
- **bank_code** character varying
- **agency** character varying
- **account** character varying
- **type** character varying default 'checking'::character varying
- **balance** numeric default 0
- **is_active** boolean default true
- **created_at** timestamp with time zone

## CONTAS_FINANCEIRAS

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL -> EMPRESAS
- **name** character varying NOT NULL
- **type** character varying default 'checking'::character varying
- **balance** numeric default 0
- **is_active** boolean default true
- **created_at** timestamp with time zone
- **company_id** uuid -> CONTABIL_EMPRESAS
- **bank_name** character varying
- **agency** character varying
- **account_number** character varying
- **pix_key** character varying

## CUPONS

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL
- **code** text NOT NULL
- **description** text
- **discount_type** text NOT NULL default 'percent'::text
- **discount_value** numeric NOT NULL default 0
- **min_total** numeric default 0
- **max_uses** integer
- **used_count** integer default 0
- **per_customer** integer
- **customer_id** uuid
- **valid_from** date
- **valid_until** date
- **active** boolean default true
- **created_at** timestamp with time zone
- **updated_at** timestamp with time zone

## CUPONS_USOS

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL
- **coupon_id** uuid NOT NULL
- **customer_id** uuid
- **sale_id** uuid
- **discount** numeric default 0
- **created_at** timestamp with time zone

## DESPESAS_FIXAS

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL -> EMPRESAS
- **name** character varying NOT NULL
- **amount** numeric NOT NULL
- **due_day** smallint NOT NULL default 5
- **supplier_id** uuid -> FORNECEDORES
- **chart_account_id** uuid
- **cost_center_id** uuid
- **notes** text
- **auto_generate** boolean NOT NULL default true
- **start_month** date NOT NULL default (date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone))::date
- **end_month** date
- **is_active** boolean NOT NULL default true
- **created_at** timestamp with time zone
- **updated_at** timestamp with time zone
- **employee_id** uuid -> CLIENTES
- **category** character varying
- **cost_center** character varying
- **periodicity** character varying NOT NULL default 'mensal'::character varying
- **original_amount** numeric
- **due_month** smallint
- **origin** character varying NOT NULL default 'manual'::character varying

## EMPRESAS

- **id** uuid NOT NULL
- **name** character varying NOT NULL
- **app_name** character varying default 'Dator ERP'::character varying
- **cnpj** character varying
- **logo_url** text
- **address** jsonb default '{}'::jsonb
- **phone** character varying
- **email** character varying
- **plan** character varying default 'basic'::character varying
- **is_active** boolean default true
- **settings** jsonb default '{}'::jsonb
- **created_at** timestamp with time zone
- **updated_at** timestamp with time zone

## ESCALA

- **Escala** bigint
- **Descrição** text
- **Est.** bigint
- **Classe** bigint
- **H.DSR** text
- **H.Semana** text
- **H.Mês** text
- **Limite 1 Bco** text
- **Limite 2 Bco** text
- **Tipo Feriado** text
- **Fer** bigint
- **Tab. Feriados Oficial** bigint
- **Marc. Folga** bigint
- **Sep.Jor.** text
- **Prj. Horário Folga** bigint

## ESCALAS

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL
- **name** text NOT NULL
- **daily_minutes** integer NOT NULL default 480
- **weekdays** int4[] NOT NULL default '{1,2,3,4,5}'::integer[]
- **entry_time** time without time zone
- **exit_time** time without time zone
- **break_minutes** integer default 60
- **tolerance_minutes** integer default 10
- **is_active** boolean default true
- **created_at** timestamp with time zone

## ESOCIAL_EVENTOS

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL
- **tipo** text NOT NULL
- **ambiente** text
- **ref_type** text
- **ref_id** uuid
- **per_apur** text
- **payload** jsonb
- **xml** text
- **status** text NOT NULL default 'pendente'::text
- **protocolo** text
- **recibo** text
- **retorno** jsonb
- **erro_msg** text
- **tentativas** integer default 0
- **sent_at** timestamp with time zone
- **processed_at** timestamp with time zone
- **created_at** timestamp with time zone
- **updated_at** timestamp with time zone
- **user_id** uuid

## FERIADOS

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL
- **date** date NOT NULL
- **name** text NOT NULL
- **type** text default 'nacional'::text
- **created_at** timestamp with time zone

## FORNECEDORES

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL -> EMPRESAS
- **name** character varying NOT NULL
- **cnpj** character varying
- **ie** character varying
- **email** character varying
- **phone** character varying
- **contact_name** character varying
- **address** jsonb default '{}'::jsonb
- **notes** text
- **is_active** boolean default true
- **created_at** timestamp with time zone
- **documents** jsonb NOT NULL default '{}'::jsonb

## INSUMOS

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL -> EMPRESAS
- **category** character varying NOT NULL
- **name** character varying NOT NULL
- **supplier_id** uuid -> FORNECEDORES
- **supplier_name** character varying
- **base_unit** character varying NOT NULL default 'ml'::character varying
- **package_qty** numeric NOT NULL
- **package_price** numeric NOT NULL
- **cost_method** character varying NOT NULL default 'consumo'::character varying
- **consumption** numeric default 0
- **lifespan** numeric default 0
- **notes** text
- **is_active** boolean NOT NULL default true
- **created_at** timestamp with time zone
- **updated_at** timestamp with time zone
- **product_id** uuid -> PRODUTOS
- **min_stock** numeric NOT NULL default 0
- **cost_source** character varying NOT NULL default 'manual'::character varying
- **current_stock** numeric NOT NULL default 0

## INSUMO_FORNECEDORES

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL -> EMPRESAS
- **insumo_id** uuid NOT NULL -> INSUMOS
- **supplier_id** uuid -> FORNECEDORES
- **supplier_name** character varying
- **package_qty** numeric NOT NULL
- **package_price** numeric NOT NULL
- **lead_time_days** smallint
- **is_default** boolean NOT NULL default false
- **notes** text
- **created_at** timestamp with time zone
- **updated_at** timestamp with time zone

## INSUMO_MOVIMENTOS

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL -> EMPRESAS
- **insumo_id** uuid NOT NULL -> INSUMOS
- **tipo** character varying NOT NULL
- **quantity** numeric NOT NULL
- **saldo_apos** numeric NOT NULL default 0
- **unit_cost** numeric
- **total** numeric
- **reference** character varying
- **notes** text
- **user_name** character varying
- **created_at** timestamp with time zone

## INSUMO_PRECOS

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL -> EMPRESAS
- **insumo_id** uuid NOT NULL -> INSUMOS
- **supplier_id** uuid -> FORNECEDORES
- **supplier_name** character varying
- **package_qty** numeric NOT NULL
- **package_price** numeric NOT NULL
- **unit_cost** numeric NOT NULL
- **source** character varying NOT NULL default 'manual'::character varying
- **reference** character varying
- **user_name** character varying
- **created_at** timestamp with time zone

## ITEM_APLICACOES

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL -> EMPRESAS
- **item_id** uuid NOT NULL -> ITENS
- **category_id** uuid
- **product_id** uuid
- **padrao** boolean NOT NULL default false
- **consumo** numeric
- **created_at** timestamp with time zone NOT NULL

## ITENS

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL -> EMPRESAS
- **kind** character varying NOT NULL default 'acessorio'::character varying
- **name** character varying NOT NULL
- **color_name** character varying
- **color_hex** character varying
- **photo_url** text
- **base_unit** character varying NOT NULL default 'un'::character varying
- **package_qty** numeric
- **package_cost** numeric
- **unit_cost** numeric NOT NULL default 0
- **unit_price** numeric NOT NULL default 0
- **consumo** numeric NOT NULL default 1
- **supplier_id** uuid -> FORNECEDORES
- **notes** text
- **is_active** boolean NOT NULL default true
- **seq** integer NOT NULL default 0
- **created_at** timestamp with time zone NOT NULL
- **updated_at** timestamp with time zone NOT NULL
- **categoria** character varying

## LANCAMENTOS

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL -> EMPRESAS
- **type** character varying NOT NULL
- **description** character varying
- **amount** numeric NOT NULL
- **paid_amount** numeric default 0
- **due_date** date NOT NULL
- **paid_date** date
- **status** character varying default 'pending'::character varying
- **reference_type** character varying
- **reference_id** uuid
- **customer_id** uuid -> CLIENTES
- **supplier_id** uuid -> FORNECEDORES
- **payment_method** character varying
- **account_id** uuid -> CONTAS_FINANCEIRAS
- **installment_number** integer default 1
- **installment_total** integer default 1
- **notes** text
- **created_at** timestamp with time zone
- **cost_center_id** uuid -> CENTROS_CUSTO
- **chart_account_id** uuid -> PLANO_CONTAS
- **installment** integer default 1
- **total_installments** integer default 1
- **document_number** character varying
- **recurrence** character varying
- **gateway_payment_id** text
- **pix_qr** text
- **pix_copy_paste** text
- **fixed_expense_id** uuid -> DESPESAS_FIXAS
- **competence_month** date
- **user_id** uuid
- **receipt_url** text
- **receipt_read** jsonb
- **receipt_status** text
- **receipt_at** timestamp with time zone
- **receipt_by** text
- **boleto_url** text
- **receipt_amount** numeric
- **paid_by** text
- **paid_at** timestamp with time zone

## LOGISTICA_CAIXAS

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL -> EMPRESAS
- **nome** character varying NOT NULL
- **largura_cm** numeric NOT NULL
- **altura_cm** numeric NOT NULL
- **comprimento_cm** numeric NOT NULL
- **peso_cheia_kg** numeric
- **valor** numeric NOT NULL default 0
- **ativo** boolean NOT NULL default true
- **observacao** text
- **created_at** timestamp with time zone
- **updated_at** timestamp with time zone

## LOGISTICA_REGRAS

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL -> EMPRESAS
- **category_id** uuid NOT NULL -> CATEGORIAS
- **capacidade_ml** integer
- **caixa_id** uuid -> LOGISTICA_CAIXAS
- **unidades_por_caixa** integer
- **caixa_pequena_id** uuid -> LOGISTICA_CAIXAS
- **unidades_caixa_pequena** integer
- **ativo** boolean NOT NULL default true
- **observacao** text
- **created_at** timestamp with time zone
- **updated_at** timestamp with time zone

## LYON_PRIME_HISTORICO

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL
- **customer_id** uuid NOT NULL
- **event** text NOT NULL
- **stars_from** integer
- **stars_to** integer
- **selo** boolean
- **total_12m** numeric
- **note** text
- **created_at** timestamp with time zone NOT NULL

## MALOTES_CONTADOR

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL
- **competencia** date NOT NULL
- **enviado_em** timestamp with time zone NOT NULL
- **enviado_por** text
- **user_id** uuid
- **destinatario** text
- **observacao** text
- **resumo** jsonb NOT NULL default '{}'::jsonb
- **itens** jsonb NOT NULL default '[]'::jsonb
- **created_at** timestamp with time zone NOT NULL

## MAQUINAS

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL -> EMPRESAS
- **grupo** character varying NOT NULL default 'maquinario'::character varying
- **codigo** character varying NOT NULL
- **nome** character varying NOT NULL
- **tipo** character varying
- **setor** character varying
- **status** character varying NOT NULL default 'operacao'::character varying
- **fabricante** character varying
- **modelo** character varying
- **numero_serie** character varying
- **supplier_id** uuid -> FORNECEDORES
- **fornecedor_nome** character varying
- **localizacao** character varying
- **responsavel** character varying
- **data_aquisicao** date
- **nota_fiscal** character varying
- **garantia_ate** date
- **valor_aquisicao** numeric NOT NULL default 0
- **valor_residual** numeric NOT NULL default 0
- **vida_util_anos** numeric NOT NULL default 10
- **vida_util_unidades** numeric
- **meta_reposicao** numeric NOT NULL default 0
- **valor_venda_estimado** numeric NOT NULL default 0
- **reserva_reposicao** numeric NOT NULL default 0
- **entra_no_rateio** boolean NOT NULL default true
- **capacidade_hora** numeric
- **producao_inicial** numeric NOT NULL default 0
- **horas_iniciais** numeric NOT NULL default 0
- **intervalo_revisao_unidades** numeric
- **producao_ultima_revisao** numeric
- **ultima_revisao** date
- **proxima_revisao** date
- **observacoes** text
- **created_at** timestamp with time zone
- **updated_at** timestamp with time zone
- **fornecedor_telefone** character varying
- **fornecedor_email** character varying

## MAQUINA_EVENTOS

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL -> EMPRESAS
- **maquina_id** uuid NOT NULL -> MAQUINAS
- **data** date NOT NULL default CURRENT_DATE
- **tipo** character varying NOT NULL
- **descricao** text
- **responsavel** character varying
- **fornecedor** character varying
- **custo** numeric NOT NULL default 0
- **producao_impactada** numeric
- **horas_parada** numeric
- **status** character varying NOT NULL default 'concluido'::character varying
- **peca_id** uuid -> MAQUINA_PECAS
- **manutencao_id** uuid -> MAQUINA_MANUTENCOES
- **detalhes** jsonb NOT NULL default '{}'::jsonb
- **user_id** uuid
- **created_at** timestamp with time zone

## MAQUINA_MANUTENCOES

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL -> EMPRESAS
- **maquina_id** uuid NOT NULL -> MAQUINAS
- **item** character varying NOT NULL
- **tipo** character varying NOT NULL default 'preventiva'::character varying
- **periodicidade** character varying NOT NULL default 'mensal'::character varying
- **ultima_execucao** date
- **proxima_execucao** date
- **responsavel** character varying
- **custo_previsto** numeric NOT NULL default 0
- **ativo** boolean NOT NULL default true
- **observacao** text
- **created_at** timestamp with time zone
- **updated_at** timestamp with time zone

## MAQUINA_PECAS

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL -> EMPRESAS
- **codigo** character varying NOT NULL
- **nome** character varying NOT NULL
- **categoria** character varying
- **fabricante** character varying
- **supplier_id** uuid -> FORNECEDORES
- **fornecedor_nome** character varying
- **fornecedor_telefone** character varying
- **valor_unitario** numeric NOT NULL default 0
- **estoque** numeric NOT NULL default 0
- **estoque_minimo** numeric NOT NULL default 0
- **vida_util_meses** numeric
- **ultima_troca** date
- **proxima_troca** date
- **maquinas** uuid[] NOT NULL default '{}'::uuid[]
- **ativo** boolean NOT NULL default true
- **observacao** text
- **created_at** timestamp with time zone
- **updated_at** timestamp with time zone

## MAQUINA_PRODUCOES

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL -> EMPRESAS
- **maquina_id** uuid NOT NULL -> MAQUINAS
- **data** date NOT NULL default CURRENT_DATE
- **produto** character varying
- **product_id** uuid -> PRODUTOS
- **venda_id** uuid -> VENDAS
- **quantidade** numeric NOT NULL default 0
- **perdas** numeric NOT NULL default 0
- **horas** numeric NOT NULL default 0
- **operador** character varying
- **origem** character varying NOT NULL default 'manual'::character varying
- **observacao** text
- **created_at** timestamp with time zone

## MENSAGENS_INTERNAS

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL
- **thread_id** uuid NOT NULL
- **from_user_id** uuid NOT NULL
- **from_name** text
- **to_user_id** uuid
- **sale_id** uuid -> VENDAS
- **subject** text
- **body** text NOT NULL
- **read_at** timestamp with time zone
- **created_at** timestamp with time zone NOT NULL

## METAS

- **tenant_id** uuid NOT NULL
- **monthly_sales** numeric default 0
- **updated_at** timestamp with time zone

## MOVIMENTACOES_ESTOQUE

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL -> EMPRESAS
- **product_id** uuid NOT NULL -> PRODUTOS
- **type** character varying NOT NULL
- **quantity** numeric NOT NULL
- **previous_stock** numeric
- **current_stock** numeric
- **reference_type** character varying
- **reference_id** uuid
- **notes** text
- **user_id** uuid -> USUARIOS
- **created_at** timestamp with time zone

## MUNICIPIOS

- **ibge_code** text NOT NULL
- **uf** text NOT NULL
- **name** text NOT NULL
- **is_capital** boolean NOT NULL default false
- **metro_name** text
- **districts** text[] NOT NULL default '{}'::text[]
- **ddd** text
- **population** integer
- **cep_start** text
- **cep_end** text
- **synced_at** timestamp with time zone NOT NULL

## NFE_RECEBIDAS

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL -> EMPRESAS
- **chave** character varying NOT NULL
- **nome_emitente** character varying
- **documento_emitente** character varying
- **valor_total** numeric NOT NULL default 0
- **data_emissao** timestamp with time zone
- **situacao** character varying
- **tipo_nfe** character varying
- **nfe_completa** boolean NOT NULL default false
- **manifestacao** character varying
- **manifestacao_at** timestamp with time zone
- **manifestacao_proto** character varying
- **xml** text
- **purchase_id** uuid
- **versao** bigint NOT NULL default 0
- **raw** jsonb
- **created_at** timestamp with time zone NOT NULL
- **updated_at** timestamp with time zone NOT NULL

## NOTAS_FISCAIS

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL -> EMPRESAS
- **sale_id** uuid -> VENDAS
- **number** integer
- **series** character varying default '001'::character varying
- **key** character varying
- **type** text default 'nfe'::character varying
- **status** text default 'pending'::character varying
- **xml_content** text
- **pdf_url** text
- **protocol** character varying
- **issued_at** timestamp with time zone
- **authorized_at** timestamp with time zone
- **cancel_reason** text
- **error_message** text
- **created_at** timestamp with time zone
- **ref** text
- **tipo** text default 'nfe'::text
- **ambiente** text
- **numero** text
- **serie** text
- **chave** text
- **total** numeric
- **destinatario** text
- **danfe_url** text
- **xml_url** text
- **motivo** text
- **response** jsonb
- **cancelled_at** timestamp with time zone
- **user_id** uuid

## OFERTAS_ENVIOS

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL
- **oferta_id** uuid -> OFERTAS_VENDEDOR
- **user_id** uuid
- **user_name** text
- **customer_id** uuid
- **customer_name** text
- **phone** text
- **phone_digits** text
- **promo_id** uuid
- **product_id** uuid
- **product_name** text
- **message** text
- **image_url** text
- **status** text NOT NULL default 'pending'::text
- **provider_message_id** text
- **error** text
- **sent_at** timestamp with time zone
- **delivered_at** timestamp with time zone
- **read_at** timestamp with time zone
- **replied_at** timestamp with time zone
- **reply_text** text
- **created_at** timestamp with time zone NOT NULL

## OFERTAS_VENDEDOR

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL
- **user_id** uuid
- **promo_id** uuid
- **product_id** uuid
- **customers** jsonb NOT NULL default '[]'::jsonb
- **message** text
- **image_url** text
- **results** jsonb NOT NULL default '{}'::jsonb
- **status** text NOT NULL default 'sent'::text
- **created_at** timestamp with time zone NOT NULL

## ORCAMENTOS

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL -> EMPRESAS
- **number** integer NOT NULL
- **customer_id** uuid -> CLIENTES
- **user_id** uuid -> USUARIOS
- **status** character varying default 'open'::character varying
- **subtotal** numeric default 0
- **discount** numeric default 0
- **total** numeric default 0
- **notes** text
- **valid_until** date
- **artwork_notes** text
- **payment_method** character varying
- **delivery_days** integer default 10
- **converted_sale_id** uuid -> VENDAS
- **created_at** timestamp with time zone
- **updated_at** timestamp with time zone
- **event_date** date
- **max_delivery_date** date
- **origin** text

## ORCAMENTO_ITENS

- **id** uuid NOT NULL
- **quote_id** uuid NOT NULL -> ORCAMENTOS
- **product_id** uuid -> PRODUTOS
- **product_name** character varying NOT NULL
- **quantity** numeric NOT NULL default 1
- **unit_price** numeric NOT NULL default 0
- **discount** numeric default 0
- **total** numeric NOT NULL default 0
- **customization** jsonb default '{}'::jsonb
- **created_at** timestamp with time zone

## PEDIDOS_LOJA

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL
- **customer_id** uuid
- **customer** jsonb NOT NULL default '{}'::jsonb
- **items** jsonb NOT NULL default '[]'::jsonb
- **subtotal** numeric NOT NULL default 0
- **freight** numeric NOT NULL default 0
- **total** numeric NOT NULL default 0
- **notes** text
- **event_date** date
- **status** text NOT NULL default 'aguardando_pagamento'::text
- **pix_key** text
- **pix_copy_paste** text
- **pix_txid** text
- **receipt_url** text
- **paid_notified_at** timestamp with time zone
- **confirmed_at** timestamp with time zone
- **confirmed_by** uuid
- **confirmed_by_name** text
- **canceled_reason** text
- **sale_id** uuid
- **expires_at** timestamp with time zone
- **created_at** timestamp with time zone NOT NULL

## PEDIDOS_REPOSICAO

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL -> EMPRESAS
- **supplier_id** uuid -> FORNECEDORES
- **supplier_name** text NOT NULL default ''::text
- **products** jsonb NOT NULL default '[]'::jsonb
- **status** text NOT NULL default 'pending'::text
- **pdf_url** text
- **notes** text
- **created_by** uuid
- **created_at** timestamp with time zone
- **completed_at** timestamp with time zone
- **completed_by** uuid
- **protocol_number** text
- **public_token** text
- **token_expira_em** timestamp with time zone
- **resposta** jsonb
- **respondido_em** timestamp with time zone
- **cotacao_url** text
- **tentativas** integer NOT NULL default 0

## PERDAS_MATRIZ

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL
- **sale_id** uuid
- **quadro** text
- **motivo** text
- **obs** text
- **area_cm2** numeric
- **emulsao_g** numeric default 0
- **sensib_g** numeric default 0
- **removedor_ml** numeric default 0
- **custo** numeric default 0
- **user_id** uuid
- **user_name** text
- **created_at** timestamp with time zone

## PERSONALIZACAO_HISTORICO

- **id** uuid NOT NULL
- **customization_id** uuid NOT NULL -> PERSONALIZACOES
- **user_id** uuid -> USUARIOS
- **from_status** character varying
- **to_status** character varying
- **notes** text
- **created_at** timestamp with time zone

## PERSONALIZACOES

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL -> EMPRESAS
- **sale_id** uuid -> VENDAS
- **customer_id** uuid -> CLIENTES
- **title** character varying NOT NULL
- **status** character varying default 'briefing'::character varying
- **priority** character varying default 'normal'::character varying
- **deadline** date
- **artwork_url** text
- **artwork_notes** text
- **customer_notes** text
- **internal_notes** text
- **assigned_to** uuid -> USUARIOS
- **approved_at** timestamp with time zone
- **created_at** timestamp with time zone
- **updated_at** timestamp with time zone
- **design_3d** jsonb
- **preview_url** text

## PLANO_CONTAS

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL -> EMPRESAS
- **code** character varying NOT NULL
- **name** character varying NOT NULL
- **type** character varying NOT NULL
- **parent_id** uuid -> PLANO_CONTAS
- **is_active** boolean default true
- **created_at** timestamp with time zone

## PRECIFICACOES

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL -> EMPRESAS
- **product_id** uuid -> PRODUTOS
- **user_id** uuid -> USUARIOS
- **name** character varying NOT NULL
- **category** character varying
- **capacity** character varying
- **color_model** character varying
- **print_type** character varying default 'serigrafia'::character varying
- **print_colors** smallint default 1
- **calc_quantity** integer NOT NULL default 1000
- **calc_reference** character varying default 'producao_propria'::character varying
- **description** text
- **blocks** jsonb NOT NULL default '{}'::jsonb
- **tax_regime** character varying default 'simples'::character varying
- **tax_pct** numeric default 4
- **tax_notes** text
- **margin_min_pct** numeric default 20
- **margin_ideal_pct** numeric default 40
- **margin_premium_pct** numeric default 50
- **overhead_unit** numeric default 0
- **cost_direct** numeric default 0
- **cost_subtotal** numeric default 0
- **cost_unit** numeric default 0
- **price_min** numeric default 0
- **price_ideal** numeric default 0
- **price_premium** numeric default 0
- **is_active** boolean NOT NULL default true
- **created_at** timestamp with time zone
- **updated_at** timestamp with time zone
- **is_master** boolean default false
- **category_id** uuid -> CATEGORIAS

## PRODUCAO_PERDAS

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL
- **sale_id** uuid
- **product_id** uuid
- **product_name** text
- **quantity** numeric NOT NULL default 0
- **user_id** uuid
- **user_name** text
- **notes** text
- **created_at** timestamp with time zone

## PRODUTOS

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL -> EMPRESAS
- **code** character varying
- **ean** character varying
- **name** character varying NOT NULL
- **description** text
- **category_id** uuid -> CATEGORIAS
- **unit** character varying default 'UN'::character varying
- **cost_price** numeric default 0
- **sale_price** numeric default 0
- **min_stock** numeric default 0
- **current_stock** numeric default 0
- **ncm** character varying
- **cst** character varying
- **cfop** character varying
- **csosn** character varying
- **pis_cst** character varying
- **cofins_cst** character varying
- **photos** jsonb default '[]'::jsonb
- **is_active** boolean default true
- **customizable** boolean default false
- **notes** text
- **created_at** timestamp with time zone
- **updated_at** timestamp with time zone
- **supplier_id** uuid -> FORNECEDORES
- **height** numeric
- **weight** numeric
- **thickness** numeric
- **base_circumference** numeric
- **mouth_circumference** numeric
- **length** numeric
- **width** numeric
- **price_tiers** jsonb default '[]'::jsonb
- **min_order_qty** integer default 10
- **print_pricing** jsonb default '{}'::jsonb
- **variations** jsonb default '{}'::jsonb
- **image_url** text
- **variation_images** jsonb default '{}'::jsonb
- **store_group** text
- **store_color** text
- **show_in_store** boolean NOT NULL default true
- **pricing_sheet_id** uuid -> PRECIFICACOES
- **product_kind** text NOT NULL default 'simple'::text
- **base_product_id** uuid -> PRODUTOS
- **reorder_qty** numeric
- **tipo_id** uuid -> TIPOS_PRODUTO
- **ink_type** text
- **show_in_catalogo** boolean NOT NULL default false
- **cor_item_id** uuid -> ITENS

## PRODUTO_AMBIENTE

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL -> EMPRESAS
- **product_id** uuid NOT NULL -> PRODUTOS
- **ambiente** text NOT NULL
- **sale_price** numeric
- **price_tiers** jsonb
- **min_order_qty** integer
- **image_url** text
- **description** text
- **created_at** timestamp with time zone NOT NULL
- **updated_at** timestamp with time zone NOT NULL

## PRODUTO_COMPATIBILIDADE

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL -> EMPRESAS
- **category_id** uuid -> CATEGORIAS
- **product_id** uuid -> PRODUTOS
- **tipo** text NOT NULL
- **ref_id** uuid NOT NULL
- **permitido** boolean NOT NULL default true
- **created_at** timestamp with time zone NOT NULL

## PRODUTO_RECEITA

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL -> EMPRESAS
- **product_id** uuid NOT NULL -> PRODUTOS
- **process** text
- **insumo_id** uuid -> INSUMOS
- **qty_per_piece** numeric
- **notes** text
- **created_at** timestamp with time zone
- **updated_at** timestamp with time zone

## PROMOCOES_VENDEDOR

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL
- **product_id** uuid -> PRODUTOS
- **title** text
- **suggested_qty** numeric
- **valid_until** date
- **promo_price** numeric
- **discount_pct** numeric
- **message_template** text
- **is_active** boolean NOT NULL default true
- **created_by** uuid
- **created_at** timestamp with time zone NOT NULL
- **updated_at** timestamp with time zone NOT NULL
- **image_url** text

## PROMO_CURTIDAS

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL
- **promo_id** text NOT NULL
- **visitor_id** text NOT NULL
- **created_at** timestamp with time zone NOT NULL

## QUADROS

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL
- **numero** text NOT NULL
- **gravacoes** integer default 0
- **recuperacoes** integer default 0
- **ativo** boolean default true
- **obs** text
- **created_at** timestamp with time zone
- **updated_at** timestamp with time zone

## RH_ADMISSOES

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL
- **employee_id** uuid
- **candidate_name** text
- **department_id** uuid
- **cargo_id** uuid
- **stage** text default 'captacao'::text
- **expected_date** date
- **responsible_id** uuid
- **status** text default 'em_andamento'::text
- **created_at** timestamp with time zone
- **updated_at** timestamp with time zone

## RH_CARGOS

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL
- **name** text NOT NULL
- **cbo** text
- **department_id** uuid
- **base_salary** numeric
- **is_active** boolean default true
- **created_at** timestamp with time zone

## RH_CONVITES_ADMISSAO

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL -> EMPRESAS
- **token** text NOT NULL
- **expires_at** timestamp with time zone NOT NULL
- **convidado_nome** text
- **convidado_email** text
- **status** text NOT NULL default 'aberto'::text
- **dados** jsonb
- **employee_id** uuid -> CLIENTES
- **created_by** uuid
- **created_by_name** text
- **submitted_at** timestamp with time zone
- **reviewed_at** timestamp with time zone
- **reviewed_by** uuid
- **reviewed_by_name** text
- **motivo_recusa** text
- **created_at** timestamp with time zone NOT NULL
- **updated_at** timestamp with time zone NOT NULL

## RH_DEPARTAMENTOS

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL
- **code** text NOT NULL
- **name** text NOT NULL
- **manager_id** uuid
- **cost_center_id** uuid
- **default_scale_id** uuid
- **parent_id** uuid
- **sort** integer default 0
- **is_active** boolean default true
- **created_at** timestamp with time zone
- **updated_at** timestamp with time zone

## RH_DESLIGAMENTOS

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL
- **employee_id** uuid NOT NULL
- **kind** text
- **requested_by** text default 'empresa'::text
- **notice** text
- **exit_date** date
- **exam_required** boolean default true
- **exam_done_on** date
- **homolog_required** boolean default false
- **homolog_on** date
- **rescission_total** numeric
- **access_revoked_at** timestamp with time zone
- **esocial_status** text
- **status** text default 'em_andamento'::text
- **created_at** timestamp with time zone
- **updated_at** timestamp with time zone

## RH_DOCUMENTOS

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL
- **employee_id** uuid NOT NULL -> CLIENTES
- **type** text NOT NULL
- **description** text
- **document_date** date
- **file_url** text
- **notes** text
- **created_at** timestamp with time zone
- **doc_key** text
- **category** text
- **status** text default 'anexado'::text
- **expires_at** date
- **sem_validade** boolean default false
- **required** boolean default false
- **origin** text default 'rh'::text
- **signed_at** timestamp with time zone
- **signed_by** uuid
- **version** text
- **size_bytes** bigint
- **mime** text
- **updated_at** timestamp with time zone

## RH_ESOCIAL_TRABALHADOR

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL
- **employee_id** uuid NOT NULL -> CLIENTES
- **cpf** text NOT NULL
- **nis** text
- **matricula** text
- **nome** text NOT NULL
- **nome_social** text
- **data_nascimento** date
- **sexo** text
- **raca_cor** smallint
- **estado_civil** smallint
- **grau_instrucao** text
- **nome_mae** text
- **nome_pai** text
- **pais_nascimento** text default '105'::text
- **pais_nacionalidade** text default '105'::text
- **uf_nascimento** text
- **municipio_nascimento** text
- **categoria** smallint
- **cbo** text
- **data_admissao** date
- **tp_admissao** smallint default 1
- **ind_admissao** smallint default 1
- **tp_reg_trab** smallint default 1
- **tp_reg_prev** smallint default 1
- **nat_atividade** smallint default 1
- **tp_contr** smallint default 1
- **dt_term** date
- **clau_assec** smallint
- **salario_base** numeric
- **und_sal_fixo** smallint default 5
- **dsc_sal_var** text
- **tp_jornada** smallint
- **dsc_jorn_trab** text
- **qtd_hrs_sem** numeric
- **escala_id** uuid
- **local_tp_insc** smallint default 1
- **local_nr_insc** text
- **ctps_numero** text
- **ctps_serie** text
- **ctps_uf** text
- **rg_numero** text
- **rg_orgao_emissor** text
- **rg_data_expedicao** date
- **cnh_numero** text
- **cnh_categoria** text
- **cnh_validade** date
- **endereco** jsonb default '{}'::jsonb
- **dependentes** jsonb default '[]'::jsonb
- **situacao** text default 'pendente'::text
- **data_desligamento** date
- **mtv_desligamento** text
- **created_at** timestamp with time zone
- **updated_at** timestamp with time zone

## RH_FERIAS

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL
- **employee_id** uuid NOT NULL -> CLIENTES
- **start_date** date NOT NULL
- **end_date** date NOT NULL
- **days** integer
- **status** text default 'scheduled'::text
- **approved_by** uuid
- **notes** text
- **created_at** timestamp with time zone
- **updated_at** timestamp with time zone
- **kind** text default 'ferias'::text
- **reason** text
- **cid** text
- **doc_url** text
- **aquisitivo_inicio** date
- **aquisitivo_fim** date
- **abono_pecuniario** boolean default false
- **abono_dias** integer
- **adiantar_decimo** boolean default false
- **inss_apos_15** boolean default false
- **exame_retorno_exigido** boolean default false
- **exame_retorno_em** date
- **retorno_real** date
- **requested_by** uuid
- **origin** text default 'rh'::text
- **approved_at** timestamp with time zone
- **esocial_evento_id** uuid

## RH_MARCACOES

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL
- **employee_id** uuid NOT NULL -> CLIENTES
- **work_date** date NOT NULL
- **punch_time** time without time zone NOT NULL
- **punched_at** timestamp with time zone
- **source** text default 'manual'::text
- **device** text
- **latitude** numeric
- **longitude** numeric
- **registered_by** uuid
- **notes** text
- **created_at** timestamp with time zone

## RH_NOTIFICACOES

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL
- **employee_id** uuid
- **canal** text NOT NULL default 'whatsapp'::text
- **destino** text
- **assunto** text
- **mensagem** text NOT NULL
- **motivo** text
- **ref_type** text
- **ref_id** uuid
- **status** text NOT NULL default 'pendente'::text
- **erro** text
- **tentativas** integer default 0
- **enviada_em** timestamp with time zone
- **created_at** timestamp with time zone

## RH_OCORRENCIAS

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL
- **employee_id** uuid NOT NULL
- **kind** text NOT NULL
- **occurred_on** date NOT NULL
- **severity** text default 'media'::text
- **origin** text default 'ponto'::text
- **status** text default 'aberta'::text
- **minutes** integer
- **description** text
- **document_url** text
- **ai_score** integer
- **ai_note** text
- **decided_by** uuid
- **decided_at** timestamp with time zone
- **sla_due_at** timestamp with time zone
- **created_at** timestamp with time zone
- **updated_at** timestamp with time zone
- **ponto_id** uuid
- **notificado_em** timestamp with time zone

## RH_POLITICAS

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL
- **chave** text NOT NULL
- **titulo** text NOT NULL
- **versao** text NOT NULL default '1.0'::text
- **vigente_desde** date default CURRENT_DATE
- **conteudo** text
- **arquivo_url** text
- **obrigatoria** boolean default true
- **is_active** boolean default true
- **created_at** timestamp with time zone

## RH_POLITICAS_ACEITES

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL
- **politica_id** uuid NOT NULL
- **employee_id** uuid NOT NULL
- **versao** text NOT NULL
- **aceito_em** timestamp with time zone
- **ip** text
- **origem** text default 'portal'::text

## RH_PONTO

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL
- **employee_id** uuid NOT NULL -> CLIENTES
- **work_date** date NOT NULL
- **entry1** time without time zone
- **exit1** time without time zone
- **entry2** time without time zone
- **exit2** time without time zone
- **total_minutes** integer default 0
- **extra_minutes** integer default 0
- **expected_minutes** integer default 0
- **late_minutes** integer default 0
- **status** text
- **escala_id** uuid
- **absence** boolean default false
- **justification** text
- **notes** text
- **override_situation** text
- **override_note** text
- **override_minutes** integer
- **created_at** timestamp with time zone

## RH_RUBRICAS

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL
- **cod_rubrica** text NOT NULL
- **ide_tabela_rubrica** text NOT NULL default '1'::text
- **ini_valid** text NOT NULL
- **fim_valid** text
- **dsc_rubrica** text NOT NULL
- **nat_rubrica** smallint
- **tp_rubrica** smallint NOT NULL
- **cod_inc_cp** text
- **cod_inc_irrf** text
- **cod_inc_fgts** text
- **cod_inc_sind** text
- **teto_remun** smallint default 0
- **observacao** text
- **is_system** boolean default false
- **is_active** boolean default true
- **created_at** timestamp with time zone
- **updated_at** timestamp with time zone

## RH_SALARIOS

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL
- **employee_id** uuid NOT NULL -> CLIENTES
- **reference_month** text NOT NULL
- **base_salary** numeric default 0
- **bonus** numeric default 0
- **overtime_pay** numeric default 0
- **other_additions** numeric default 0
- **gross_salary** numeric default 0
- **inss_deduction** numeric default 0
- **irrf_deduction** numeric default 0
- **other_deductions** numeric default 0
- **fgts_value** numeric default 0
- **net_salary** numeric default 0
- **status** text default 'draft'::text
- **payment_method** text
- **payment_date** date
- **notes** text
- **created_at** timestamp with time zone
- **kind** text default 'mensal'::text

## RH_SALARIOS_ITENS

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL
- **payroll_id** uuid NOT NULL -> RH_SALARIOS
- **rubrica_id** uuid -> RH_RUBRICAS
- **cod_rubrica** text NOT NULL
- **ide_tabela_rubrica** text default '1'::text
- **qtd_rubrica** numeric
- **fator_rubrica** numeric
- **vr_unit** numeric
- **vr_rubrica** numeric NOT NULL
- **ind_apur_ir** smallint default 0
- **ordem** integer default 0
- **created_at** timestamp with time zone

## RH_SOLICITACOES

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL
- **employee_id** uuid NOT NULL -> CLIENTES
- **kind** text NOT NULL
- **titulo** text
- **descricao** text
- **payload** jsonb NOT NULL default '{}'::jsonb
- **anexo_url** text
- **status** text NOT NULL default 'aberta'::text
- **origin** text default 'portal'::text
- **decided_by** uuid
- **decided_at** timestamp with time zone
- **decision_note** text
- **applied_at** timestamp with time zone
- **created_at** timestamp with time zone NOT NULL

## SETORES_PERFIS

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL
- **key** text NOT NULL
- **name** text NOT NULL
- **modules** jsonb NOT NULL default '[]'::jsonb
- **layout** text NOT NULL default 'erp'::text
- **home_path** text NOT NULL default '/'::text
- **sort** integer NOT NULL default 0
- **is_system** boolean NOT NULL default false
- **created_at** timestamp with time zone NOT NULL
- **updated_at** timestamp with time zone NOT NULL
- **screens** jsonb

## SITUACOES

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL
- **code** text NOT NULL
- **name** text NOT NULL
- **kind** text default 'neutral'::text
- **color** text default 'gray'::text
- **insertable** boolean default true
- **is_system** boolean default false
- **is_active** boolean default true
- **created_at** timestamp with time zone

## TABELAS_PRECO

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL -> EMPRESAS
- **name** character varying NOT NULL
- **discount_percent** numeric default 0
- **is_active** boolean default true
- **created_at** timestamp with time zone

## TABELA_PRECO_ITENS

- **id** uuid NOT NULL
- **price_table_id** uuid NOT NULL -> TABELAS_PRECO
- **product_id** uuid NOT NULL
- **price** numeric NOT NULL
- **min_qty** numeric default 1
- **created_at** timestamp with time zone

## TIPOS_PRODUTO

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL
- **name** text NOT NULL
- **created_at** timestamp with time zone NOT NULL

## TOTALEXPRESS_ABRANGENCIA

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL -> EMPRESAS
- **cep_ini** integer NOT NULL
- **cep_fim** integer NOT NULL
- **uf** character varying
- **ibge** character varying
- **municipio** character varying
- **base** character varying
- **risco** character varying
- **prazo** integer
- **atendimento** character varying
- **localidade** character varying
- **geografia** character varying NOT NULL

## TOTALEXPRESS_ENVIOS

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL -> EMPRESAS
- **sale_id** uuid NOT NULL -> VENDAS
- **pedido** character varying NOT NULL
- **cod_remessa** character varying
- **protocolo** character varying
- **situacao** character varying NOT NULL default 'enviado'::character varying
- **erro** text
- **awb** character varying
- **ultimo_status_codigo** integer
- **ultimo_status** text
- **ultimo_status_em** timestamp with time zone
- **link_rastreio** text
- **resposta** jsonb
- **enviado_por** text
- **created_at** timestamp with time zone
- **updated_at** timestamp with time zone

## TOTALEXPRESS_GEOGRAFIAS

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL -> EMPRESAS
- **geografia** character varying NOT NULL
- **adicional_kg** numeric NOT NULL default 0

## TOTALEXPRESS_LOTES

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL -> EMPRESAS
- **cod_retorno** bigint NOT NULL
- **data_geracao** timestamp with time zone
- **conteudo** jsonb NOT NULL
- **processado_em** timestamp with time zone
- **erro** text
- **created_at** timestamp with time zone

## TOTALEXPRESS_TARIFAS

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL -> EMPRESAS
- **geografia** character varying NOT NULL
- **peso_ini** numeric NOT NULL
- **peso_fim** numeric NOT NULL
- **preco** numeric NOT NULL

## TRANSPORTADORAS

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL -> EMPRESAS
- **name** text NOT NULL
- **trade_name** text
- **cnpj** text
- **email** text
- **phone** text
- **whatsapp** text
- **contact_name** text
- **rntrc** text
- **vehicle_types** text[] default '{}'::text[]
- **address** jsonb default '{}'::jsonb
- **observations** text
- **is_active** boolean NOT NULL default true
- **created_at** timestamp with time zone NOT NULL
- **updated_at** timestamp with time zone NOT NULL
- **pickup_schedule** jsonb default '[]'::jsonb
- **ie** text
- **documents** jsonb NOT NULL default '{}'::jsonb
- **is_pickup** boolean NOT NULL default false

## USUARIOS

- **id** uuid NOT NULL -> users
- **tenant_id** uuid NOT NULL -> EMPRESAS
- **name** character varying NOT NULL
- **email** character varying NOT NULL
- **role** character varying default 'operator'::character varying
- **is_active** boolean default true
- **created_at** timestamp with time zone
- **allowed_modules** jsonb
- **sector_key** text
- **phone** text
- **allowed_screens** jsonb

## VARIANTES_PRODUTO

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL -> EMPRESAS
- **product_id** uuid NOT NULL -> PRODUTOS
- **name** character varying NOT NULL
- **type** character varying default 'color'::character varying
- **value** character varying NOT NULL
- **extra_price** numeric default 0
- **stock** numeric default 0
- **is_active** boolean default true
- **created_at** timestamp with time zone

## VENDAS

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL -> EMPRESAS
- **number** integer NOT NULL
- **type** character varying default 'sale'::character varying
- **customer_id** uuid -> CLIENTES
- **user_id** uuid -> USUARIOS
- **status** character varying default 'confirmed'::character varying
- **subtotal** numeric default 0
- **discount** numeric default 0
- **total** numeric default 0
- **notes** text
- **artwork_url** text
- **artwork_notes** text
- **delivery_date** date
- **payment_method** character varying
- **created_at** timestamp with time zone
- **max_delivery_date** date
- **production_photos** jsonb default '[]'::jsonb
- **source** text default 'manual'::text
- **operation_date** date
- **production_stage** text default 'aguardando_producao'::text
- **event_date** date
- **ship_date** date
- **ship_time** text
- **carrier** text
- **art_file** text
- **production_obs** text
- **production_log** jsonb default '[]'::jsonb
- **revelacao_inicio** timestamp with time zone
- **revelacao_fim** timestamp with time zone
- **producao_inicio** timestamp with time zone
- **producao_fim** timestamp with time zone
- **embalagem_inicio** timestamp with time zone
- **embalagem_fim** timestamp with time zone
- **freight** numeric default 0
- **order_key** text
- **pintura_inicio** timestamp with time zone
- **pintura_fim** timestamp with time zone
- **carrier_id** uuid
- **tracking_code** text
- **billing_company_id** uuid -> CONTABIL_EMPRESAS
- **receiving_account_id** uuid -> CONTAS_FINANCEIRAS
- **metalizacao_inicio** timestamp with time zone
- **metalizacao_fim** timestamp with time zone
- **insumos_baixados** boolean NOT NULL default false
- **origin** text
- **freight_quote** text
- **avisos** jsonb default '[]'::jsonb
- **collect_date** date
- **transport_days** integer
- **receipt_url** text
- **delivery_mode** text
- **pickup_person** jsonb
- **idempotency_key** text

## VENDA_ITENS

- **id** uuid NOT NULL
- **sale_id** uuid NOT NULL -> VENDAS
- **product_id** uuid -> PRODUTOS
- **product_name** character varying
- **quantity** numeric NOT NULL
- **unit_price** numeric NOT NULL
- **discount** numeric default 0
- **total** numeric NOT NULL
- **customization** jsonb
- **created_at** timestamp with time zone
- **adicionais** jsonb NOT NULL default '[]'::jsonb

## VENDEDORES

- **user_id** uuid NOT NULL
- **tenant_id** uuid NOT NULL
- **is_active** boolean NOT NULL default true
- **region_label** text
- **territory** text[] NOT NULL default '{}'::text[]
- **plan_group** text NOT NULL default 'padrao'::text
- **top_clients** integer NOT NULL default 10
- **created_at** timestamp with time zone NOT NULL
- **updated_at** timestamp with time zone NOT NULL

## VENDEDOR_COMISSOES

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL
- **user_id** uuid NOT NULL
- **sale_id** uuid NOT NULL
- **reference_month** text NOT NULL
- **monthly_goal** numeric NOT NULL default 0
- **units_before** numeric NOT NULL default 0
- **units_total** numeric NOT NULL default 0
- **units_eligible** numeric NOT NULL default 0
- **amount_eligible** numeric NOT NULL default 0
- **commission_pct** numeric NOT NULL default 0
- **commission_value** numeric NOT NULL default 0
- **computed_at** timestamp with time zone NOT NULL

## VENDEDOR_PLANOS

- **id** uuid NOT NULL
- **tenant_id** uuid NOT NULL
- **plan_group** text NOT NULL default 'padrao'::text
- **name** text NOT NULL
- **seq** integer NOT NULL default 1
- **months** int4[] NOT NULL default '{}'::integer[]
- **monthly_goal** numeric NOT NULL default 0
- **cycle_bonus** numeric NOT NULL default 0
- **cycle_months** integer NOT NULL default 3
- **commission_pct** numeric NOT NULL default 2
- **is_active** boolean NOT NULL default true
- **created_at** timestamp with time zone NOT NULL
- **updated_at** timestamp with time zone NOT NULL

## _MIGRATIONS

- **version** text NOT NULL
- **name** text
- **applied_at** timestamp with time zone
