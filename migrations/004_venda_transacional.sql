-- ============================================================
-- 10. VENDA TRANSACIONAL — função criar_venda
--     Toda a venda (numeração, cabeçalho, itens, baixa de estoque
--     e movimentações) acontece em UMA transação: ou grava tudo,
--     ou nada. O preço é calculado AQUI (faixas de quantidade
--     price_tiers ou sale_price) — o preço vindo do cliente só é
--     aceito se for maior, ou se _allow_price_override = true
--     (admin/gerente).
-- ============================================================
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
  _allow_price_override BOOLEAN DEFAULT false
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
BEGIN
  IF _items IS NULL OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'A venda deve ter ao menos um item';
  END IF;
  _discount := GREATEST(COALESCE(_discount, 0), 0);

  -- Numeração sequencial por tenant (advisory lock evita duplicidade
  -- em vendas simultâneas)
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

    -- Preço oficial do servidor: faixa por quantidade ou preço de venda
    v_price := COALESCE(v_product.sale_price, 0);
    FOR v_tier IN SELECT * FROM jsonb_array_elements(COALESCE(v_product.price_tiers, '[]'::jsonb)) LOOP
      IF v_qty >= COALESCE((v_tier->>'min_qty')::NUMERIC, 0)
         AND ((v_tier->>'max_qty') IS NULL OR v_qty <= (v_tier->>'max_qty')::NUMERIC) THEN
        v_price := COALESCE((v_tier->>'price')::NUMERIC, v_price);
      END IF;
    END LOOP;

    v_client_price := (v_item->>'unit_price')::NUMERIC;
    IF _allow_price_override AND v_client_price IS NOT NULL AND v_client_price >= 0 THEN
      v_price := v_client_price;   -- admin/gerente: preço livre
    ELSIF v_client_price IS NOT NULL AND v_client_price > v_price THEN
      v_price := v_client_price;   -- vender acima da tabela é sempre permitido
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

  INSERT INTO "VENDAS" (
    tenant_id, number, type, customer_id, user_id, status,
    subtotal, discount, total, notes, artwork_url, artwork_notes,
    delivery_date, payment_method
  ) VALUES (
    _tenant_id, v_number, COALESCE(_type, 'sale'), _customer_id, _user_id, 'confirmed',
    v_subtotal, _discount, v_subtotal - _discount, _notes, _artwork_url, _artwork_notes,
    _delivery_date, _payment_method
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

  RETURN to_jsonb(v_sale);
END;
$$;

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('004', 'venda_transacional')
ON CONFLICT (version) DO NOTHING;
