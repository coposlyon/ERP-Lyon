-- ============================================================
-- 010. COMPRA TRANSACIONAL — função criar_compra
--      Cabeçalho, itens, entrada de estoque e custo médio
--      ponderado em UMA transação.
-- ============================================================
CREATE OR REPLACE FUNCTION criar_compra(
  _tenant_id   UUID,
  _user_id     UUID,
  _supplier_id UUID,
  _items       JSONB,
  _discount    NUMERIC DEFAULT 0,
  _notes       TEXT    DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_number   BIGINT;
  v_purchase "COMPRAS"%ROWTYPE;
  v_item     JSONB;
  v_qty      NUMERIC;
  v_price    NUMERIC;
  v_subtotal NUMERIC := 0;
  v_estoque  NUMERIC;
  v_custo    NUMERIC;
  v_novo     NUMERIC;
  v_found    BOOLEAN;
BEGIN
  IF _items IS NULL OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'A compra deve ter ao menos um item';
  END IF;
  _discount := GREATEST(COALESCE(_discount, 0), 0);

  PERFORM pg_advisory_xact_lock(hashtext(_tenant_id::text || ':compra'));
  SELECT COALESCE(MAX(number), 0) + 1 INTO v_number FROM "COMPRAS" WHERE tenant_id = _tenant_id;

  -- valida e calcula subtotal
  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_qty   := COALESCE((v_item->>'quantity')::NUMERIC, 0);
    v_price := GREATEST(COALESCE((v_item->>'unit_price')::NUMERIC, 0), 0);
    IF v_qty <= 0 THEN RAISE EXCEPTION 'Quantidade inválida em um item'; END IF;
    SELECT true INTO v_found FROM "PRODUTOS"
      WHERE id = (v_item->>'product_id')::UUID AND tenant_id = _tenant_id;
    IF v_found IS NOT TRUE THEN RAISE EXCEPTION 'Produto não encontrado ou de outra empresa'; END IF;
    v_subtotal := v_subtotal + v_qty * v_price;
  END LOOP;

  INSERT INTO "COMPRAS" (tenant_id, number, supplier_id, user_id, status, subtotal, discount, total, notes)
  VALUES (_tenant_id, v_number, _supplier_id, _user_id, 'received', v_subtotal, _discount, v_subtotal - _discount, _notes)
  RETURNING * INTO v_purchase;

  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_qty   := (v_item->>'quantity')::NUMERIC;
    v_price := GREATEST(COALESCE((v_item->>'unit_price')::NUMERIC, 0), 0);

    SELECT current_stock, cost_price INTO v_estoque, v_custo
      FROM "PRODUTOS" WHERE id = (v_item->>'product_id')::UUID AND tenant_id = _tenant_id FOR UPDATE;

    v_novo := v_custo;
    IF v_price > 0 THEN
      v_novo := ROUND((GREATEST(COALESCE(v_estoque,0),0) * COALESCE(v_custo,0) + v_qty * v_price)
                      / NULLIF(GREATEST(COALESCE(v_estoque,0),0) + v_qty, 0), 2);
    END IF;

    INSERT INTO "COMPRA_ITENS" (purchase_id, product_id, quantity, unit_price, total)
    VALUES (v_purchase.id, (v_item->>'product_id')::UUID, v_qty, v_price, v_qty * v_price);

    INSERT INTO "MOVIMENTACOES_ESTOQUE" (tenant_id, product_id, type, quantity, previous_stock, current_stock, reference_type, reference_id, user_id, notes)
    VALUES (_tenant_id, (v_item->>'product_id')::UUID, 'entry', v_qty, COALESCE(v_estoque,0), COALESCE(v_estoque,0) + v_qty, 'purchase', v_purchase.id, _user_id, 'Compra #' || v_number);

    UPDATE "PRODUTOS"
       SET current_stock = COALESCE(current_stock, 0) + v_qty,
           cost_price = COALESCE(v_novo, cost_price)
     WHERE id = (v_item->>'product_id')::UUID;
  END LOOP;

  RETURN to_jsonb(v_purchase);
END;
$$;

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('010', 'compra_transacional')
ON CONFLICT (version) DO NOTHING;
