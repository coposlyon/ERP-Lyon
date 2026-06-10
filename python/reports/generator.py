"""
Gerador de relatórios em PDF
Usa fpdf2 para gerar relatórios profissionais
"""
import os
import json
from fpdf import FPDF
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_SERVICE_KEY = os.getenv('SUPABASE_SERVICE_KEY')


class ERPReport(FPDF):
    def __init__(self, tenant_name: str):
        super().__init__()
        self.tenant_name = tenant_name
        self.set_auto_page_break(auto=True, margin=15)

    def header(self):
        self.set_font('Helvetica', 'B', 14)
        self.cell(0, 8, self.tenant_name, ln=True, align='C')
        self.set_font('Helvetica', '', 9)
        self.cell(0, 5, f'Gerado em: {datetime.now().strftime("%d/%m/%Y %H:%M")}', ln=True, align='C')
        self.ln(3)
        self.set_draw_color(200, 200, 200)
        self.set_line_width(0.3)
        self.line(10, self.get_y(), 200, self.get_y())
        self.ln(4)

    def footer(self):
        self.set_y(-12)
        self.set_font('Helvetica', 'I', 8)
        self.set_text_color(150, 150, 150)
        self.cell(0, 5, f'Dator ERP — Página {self.page_no()}', align='C')

    def section_title(self, title: str):
        self.set_font('Helvetica', 'B', 11)
        self.set_fill_color(240, 240, 255)
        self.cell(0, 7, f'  {title}', fill=True, ln=True)
        self.ln(2)


def generate_sale_receipt(sale_id: str, output_path: str) -> bool:
    """Gera recibo/comprovante de venda em PDF."""
    try:
        from supabase import create_client
        supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

        sale = supabase.table('sales').select(
            '*, customers(*), sale_items(*, products(*)), tenants(*)'
        ).eq('id', sale_id).single().execute().data

        if not sale:
            return False

        tenant_name = sale.get('tenants', {}).get('name', 'Empresa')
        pdf = ERPReport(tenant_name)
        pdf.add_page()

        pdf.section_title(f'PEDIDO DE VENDA #{str(sale["number"]).zfill(4)}')

        # Customer info
        pdf.set_font('Helvetica', '', 10)
        customer = sale.get('customers') or {}
        pdf.cell(0, 6, f'Cliente: {customer.get("name", "Consumidor Final")}', ln=True)
        if customer.get('cpf_cnpj'):
            pdf.cell(0, 6, f'CPF/CNPJ: {customer["cpf_cnpj"]}', ln=True)
        pdf.cell(0, 6, f'Data: {sale["created_at"][:10]}', ln=True)
        pdf.ln(3)

        # Items table
        pdf.section_title('Itens')
        pdf.set_font('Helvetica', 'B', 9)
        pdf.set_fill_color(230, 230, 240)
        cols = [80, 25, 35, 35]
        headers = ['Produto', 'Qtd', 'Preço Un.', 'Total']
        for i, h in enumerate(headers):
            pdf.cell(cols[i], 6, h, border=1, fill=True)
        pdf.ln()

        pdf.set_font('Helvetica', '', 9)
        for item in sale.get('sale_items', []):
            product = item.get('products') or {}
            pdf.cell(cols[0], 6, product.get('name', '')[:40], border=1)
            pdf.cell(cols[1], 6, f'{item["quantity"]} {product.get("unit","UN")}', border=1, align='C')
            pdf.cell(cols[2], 6, f'R$ {item["unit_price"]:.2f}', border=1, align='R')
            pdf.cell(cols[3], 6, f'R$ {item["total"]:.2f}', border=1, align='R')
            pdf.ln()

        pdf.ln(3)
        if sale.get('discount', 0) > 0:
            pdf.cell(0, 6, f'Desconto: R$ {sale["discount"]:.2f}', ln=True, align='R')
        pdf.set_font('Helvetica', 'B', 11)
        pdf.cell(0, 8, f'TOTAL: R$ {sale["total"]:.2f}', ln=True, align='R')

        # Artwork info
        if sale.get('artwork_url'):
            pdf.ln(3)
            pdf.section_title('Arte / Personalização')
            pdf.set_font('Helvetica', '', 9)
            pdf.multi_cell(0, 5, f'Arquivo: {sale["artwork_url"]}')
            if sale.get('artwork_notes'):
                pdf.multi_cell(0, 5, f'Obs: {sale["artwork_notes"]}')

        pdf.output(output_path)
        return True

    except Exception as e:
        print(f'Error generating PDF: {e}')
        return False


if __name__ == '__main__':
    import sys
    if len(sys.argv) >= 3:
        ok = generate_sale_receipt(sys.argv[1], sys.argv[2])
        print('ok' if ok else 'error')
