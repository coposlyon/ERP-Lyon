-- ============================================================
-- 113. O PEDIDO TEM UM NOME SÓ
--
-- O mesmo pedido se chamava de três jeitos: `PV-0007` na lista de
-- Pedidos de Venda, `PV-000007` no portal do cliente e no documento, e
-- `Venda #7` na descrição da parcela no Financeiro — este último escrito
-- à mão, dentro desta função.
--
-- Três nomes é o cliente perguntando por um número que o vendedor não
-- acha, e o financeiro conferindo o extrato contra uma descrição que não
-- bate com a tela de onde ela veio.
--
-- Agora é `PV-0007`, o formato da lista, aqui e no resto do sistema
-- (backend/src/lib/pedidoCodigo.js). Esta migração só troca os dois
-- textos; o corpo da função é o mesmo da 111.
--
-- AS LINHAS ANTIGAS SÃO RENOMEADAS no fim: parcela que já existe com
-- "Venda #7" continuaria com o nome velho para sempre, e a tela ficaria
-- misturando os dois enquanto essas linhas não fossem quitadas.
-- ============================================================

DROP FUNCTION IF EXISTS criar_venda(
  UUID, UUID, UUID, TEXT, JSONB, NUMERIC, TEXT, TEXT, DATE, TEXT, TEXT, BOOLEAN, INT, DATE, NUMERIC, NUMERIC
);

CREATE OR REPLACE FUNCTION criar_venda(
  _tenant_id            UUID,
  _user_id              UUID,
  _customer_id          UUID,
  _type                 TEXT,
  _items                JSONB,
  _discount             NUMERIC DEFAULT 0,
  _payment_method       TEXT    DEFAULT NULL,
  _notes                TEXT    DEFAULT NULL,
  _delivery_date        DATE    DEFAULT NULL,
  _artwork_url          TEXT    DEFAULT NULL,
  _artwork_notes        TEXT    DEFAULT NULL,
  _allow_price_override BOOLEAN DEFAULT false,
  _installments         INT     DEFAULT 1,
  _first_due_date       DATE    DEFAULT NULL,
  -- O frete do pedido e o ajuste da condição de pagamento (negativo é
  -- desconto: PIX -8%; positivo é juros do parcelado). Os dois entram
  -- no total e, portanto, nas parcelas.
  _freight              NUMERIC DEFAULT 0,
  _payment_adjustment   NUMERIC DEFAULT 0
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_number        BIGINT;
  v_sale          "VENDAS"%ROWTYPE;
  v_item          JSONB;
  v_tier          JSONB;
  v_product       RECORD;
  v_qty           NUMERIC;
  v_price         NUMERIC;
  v_client_price  NUMERIC;
  v_item_discount NUMERIC;
  v_subtotal      NUMERIC := 0;
  v_total         NUMERIC;
  v_n             INT;
  v_parcela       NUMERIC;
  v_due           DATE;
  i               INT;
BEGIN
  IF _items IS NULL OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'A venda deve ter ao menos um item';
  END IF;
  _discount := GREATEST(COALESCE(_discount, 0), 0);

  PERFORM pg_advisory_xact_lock(hashtext(_tenant_id::text || ':venda'));
  SELECT COALESCE(MAX(number), 0) + 1 INTO v_number
    FROM "VENDAS" WHERE tenant_id = _tenant_id;

  DROP TABLE IF EXISTS tmp_venda_itens;
  CREATE TEMP TABLE tmp_venda_itens (
    product_id    UUID,
    quantity      NUMERIC,
    unit_price    NUMERIC,
    discount      NUMERIC,
    total         NUMERIC,
    customization JSONB,
    prev_stock    NUMERIC
  ) ON COMMIT DROP;

  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_qty := COALESCE((v_item->>'quantity')::NUMERIC, 0);
    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Quantidade inválida em um dos itens';
    END IF;

    SELECT id, name, sale_price, price_tiers, is_active, current_stock
      INTO v_product
      FROM "PRODUTOS"
     WHERE id = (v_item->>'product_id')::UUID
       AND tenant_id = _tenant_id
     FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Produto não encontrado ou de outra empresa';
    END IF;
    IF v_product.is_active = false THEN
      RAISE EXCEPTION 'Produto inativo: %', v_product.name;
    END IF;

    v_price := COALESCE(v_product.sale_price, 0);
    FOR v_tier IN SELECT * FROM jsonb_array_elements(COALESCE(v_product.price_tiers, '[]'::jsonb)) LOOP
      IF v_qty >= COALESCE((v_tier->>'min_qty')::NUMERIC, 0)
         AND ((v_tier->>'max_qty') IS NULL OR v_qty <= (v_tier->>'max_qty')::NUMERIC) THEN
        v_price := COALESCE((v_tier->>'price')::NUMERIC, v_price);
      END IF;
    END LOOP;

    v_client_price := (v_item->>'unit_price')::NUMERIC;
    IF _allow_price_override AND v_client_price IS NOT NULL AND v_client_price >= 0 THEN
      v_price := v_client_price;
    ELSIF v_client_price IS NOT NULL AND v_client_price > v_price THEN
      v_price := v_client_price;
    END IF;

    v_item_discount := GREATEST(COALESCE((v_item->>'discount')::NUMERIC, 0), 0);
    IF v_item_discount > v_qty * v_price THEN
      RAISE EXCEPTION 'Desconto do item maior que o valor do item (%)', v_product.name;
    END IF;

    INSERT INTO tmp_venda_itens VALUES (
      v_product.id, v_qty, v_price, v_item_discount,
      v_qty * v_price - v_item_discount,
      CASE WHEN v_item ? 'customization' THEN v_item->'customization' ELSE NULL END,
      COALESCE(v_product.current_stock, 0)
    );
    v_subtotal := v_subtotal + (v_qty * v_price);

    UPDATE "PRODUTOS"
       SET current_stock = COALESCE(current_stock, 0) - v_qty
     WHERE id = v_product.id;
  END LOOP;

  IF _discount > v_subtotal THEN
    RAISE EXCEPTION 'Desconto maior que o subtotal da venda';
  END IF;
  -- O TOTAL CHEIO: produtos - desconto + frete + ajuste da condição.
  -- É este número que vira o valor do pedido E a soma das parcelas.
  v_total := GREATEST(v_subtotal - _discount
                      + COALESCE(_freight, 0)
                      + COALESCE(_payment_adjustment, 0), 0);

  INSERT INTO "VENDAS" (
    tenant_id, number, type, customer_id, user_id, status,
    subtotal, discount, total, notes, artwork_url, artwork_notes,
    delivery_date, payment_method, freight
  ) VALUES (
    _tenant_id, v_number, COALESCE(_type, 'sale'), _customer_id, _user_id, 'confirmed',
    v_subtotal, _discount, v_total, _notes, _artwork_url, _artwork_notes,
    _delivery_date, _payment_method, COALESCE(_freight, 0)
  ) RETURNING * INTO v_sale;

  INSERT INTO "VENDA_ITENS" (sale_id, product_id, quantity, unit_price, discount, total, customization)
  SELECT v_sale.id, product_id, quantity, unit_price, discount, total, customization
    FROM tmp_venda_itens;

  INSERT INTO "MOVIMENTACOES_ESTOQUE" (
    tenant_id, product_id, type, quantity,
    previous_stock, current_stock,
    reference_type, reference_id, user_id, notes
  )
  SELECT _tenant_id, t.product_id, 'exit', t.quantity,
         t.prev_stock, t.prev_stock - t.quantity,
         'sale', v_sale.id, _user_id, 'Venda #' || v_number
    FROM tmp_venda_itens t;

  -- Venda a prazo → gera contas a receber
  IF _payment_method = 'a_prazo' THEN
    IF _customer_id IS NULL THEN
      RAISE EXCEPTION 'Venda a prazo exige um cliente identificado';
    END IF;
    v_n     := GREATEST(COALESCE(_installments, 1), 1);
    v_due   := COALESCE(_first_due_date, CURRENT_DATE + 30);
    v_parcela := ROUND(v_total / v_n, 2);

    FOR i IN 1..v_n LOOP
      INSERT INTO "LANCAMENTOS" (
        tenant_id, user_id, description, type, amount, paid_amount,
        due_date, status, customer_id, document_number,
        installment, total_installments, reference_type, reference_id
      ) VALUES (
        _tenant_id, _user_id,
        'PV-' || LPAD(v_number::text, 4, '0')
          || CASE WHEN v_n > 1 THEN ' (' || i || '/' || v_n || ')' ELSE '' END,
        'receivable',
        CASE WHEN i = v_n THEN v_total - v_parcela * (v_n - 1) ELSE v_parcela END,
        0,
        (v_due + ((i - 1) || ' month')::interval)::date,
        'pending', _customer_id, 'PV-' || LPAD(v_number::text, 4, '0'),
        i, v_n, 'sale', v_sale.id
      );
    END LOOP;
  END IF;

  RETURN to_jsonb(v_sale);
END;
$$;


-- ── O passado, renomeado ─────────────────────────────────────
-- 'Venda #7 (1/2)' → 'PV-0007 (1/2)'; 'Venda #7 — diferença da edição'
-- → 'PV-0007 — diferença da edição'. O número sai do próprio texto, e
-- só linhas que começam com o padrão antigo são tocadas.
UPDATE "LANCAMENTOS"
   SET description = regexp_replace(description, '^Venda #(\d+)',
         'PV-' || LPAD((regexp_match(description, '^Venda #(\d+)'))[1], 4, '0'))
 WHERE description ~ '^Venda #\d+';

UPDATE "LANCAMENTOS"
   SET document_number = regexp_replace(document_number, '^Venda #(\d+)',
         'PV-' || LPAD((regexp_match(document_number, '^Venda #(\d+)'))[1], 4, '0'))
 WHERE document_number ~ '^Venda #\d+';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('113', 'codigo_do_pedido_no_financeiro')
ON CONFLICT (version) DO NOTHING;
