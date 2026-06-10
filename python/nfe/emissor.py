"""
Módulo de emissão de NF-e
Integração com SEFAZ via biblioteca python-nfe
"""
import os
import json
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_SERVICE_KEY = os.getenv('SUPABASE_SERVICE_KEY')
NFE_ENVIRONMENT = os.getenv('NFE_ENVIRONMENT', '2')  # 1=producao, 2=homologacao
NFE_UF = os.getenv('NFE_UF', 'PR')


def emit_nfe(sale_id: str, tenant_id: str) -> dict:
    """
    Emite uma NF-e para o pedido de venda indicado.

    Args:
        sale_id: UUID do pedido de venda no Supabase
        tenant_id: UUID do tenant (empresa)

    Returns:
        dict com status, chave NF-e e protocolo
    """
    try:
        from supabase import create_client

        supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

        # Busca dados da venda
        sale = supabase.table('sales').select(
            '*, customers(*), sale_items(*, products(*))'
        ).eq('id', sale_id).single().execute().data

        if not sale:
            return {'success': False, 'error': 'Pedido não encontrado'}

        # Busca configurações da empresa (tenant)
        tenant = supabase.table('tenants').select('*').eq('id', tenant_id).single().execute().data

        # TODO: implementar geração do XML NF-e completo
        # Utilizar biblioteca python-nfe ou pynfe
        # Seguir layout NF-e 4.00 (arquivo schemas/nfe_v4.00.xsd)

        nfe_result = {
            'success': True,
            'key': '41' + '0' * 42,  # placeholder - substituir com chave real
            'protocol': None,
            'status': 'pending',
            'xml': None,
        }

        # Atualiza status na tabela invoices
        supabase.table('invoices').update({
            'status': nfe_result['status'],
            'key': nfe_result['key'],
        }).eq('sale_id', sale_id).execute()

        return nfe_result

    except Exception as e:
        return {'success': False, 'error': str(e)}


def cancel_nfe(invoice_id: str, tenant_id: str, reason: str) -> dict:
    """Cancela uma NF-e autorizada."""
    try:
        from supabase import create_client
        supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

        invoice = supabase.table('invoices').select('*').eq('id', invoice_id).single().execute().data

        if not invoice or invoice['status'] != 'authorized':
            return {'success': False, 'error': 'NF-e não pode ser cancelada'}

        # TODO: implementar cancelamento via SEFAZ

        supabase.table('invoices').update({
            'status': 'cancelled',
            'cancel_reason': reason,
        }).eq('id', invoice_id).execute()

        return {'success': True}

    except Exception as e:
        return {'success': False, 'error': str(e)}


if __name__ == '__main__':
    import sys
    if len(sys.argv) >= 3:
        result = emit_nfe(sys.argv[1], sys.argv[2])
        print(json.dumps(result))
