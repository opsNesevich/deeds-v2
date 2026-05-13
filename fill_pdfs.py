#!/usr/bin/env python3
import sys, json, os, io, shutil, zipfile, re
from pypdf import PdfReader, PdfWriter

TEMPLATES = os.path.join(os.path.dirname(__file__), 'templates')

def fill_affidavit(data, output_path):
    reader = PdfReader(os.path.join(TEMPLATES, 'affidavit-template.pdf'))
    writer = PdfWriter()
    writer.append(reader)
    deed_date = data.get('signingDate') or '_______________'
    ssn = ('XXX-XX-' + data['ssn']) if data.get('ssn') else 'XXX-XX-___'
    grantor = data.get('grantor', '')
    grantor2 = data.get('grantor2', '')
    full_grantor = (grantor + ' and ' + grantor2) if grantor2 else grantor
    grantor_addr = data.get('grantorAddr', '')
    fields = {
        'County': data.get('county', 'Burlington'),
        'County Municipal Code': data.get('countyMunicipalCode', '0319'),
        'Municipality of Property Location': data.get('municipality', ''),
        'Deponent Name': full_grantor,
        'Deponent Title': 'Grantor',
        'Deed Dated': deed_date,
        'Block Number': data.get('block', ''),
        'Lot Number': data.get('lot', ''),
        'Property Address': data.get('propAddr', ''),
        'Consideration Amount': '$1.00',
        'Full Exemption From Fee, Line 1': 'For consideration of less than $100.',
        'Grantor Name': full_grantor,
        "Last 3 digits of Grant's SSN": ssn,
        'Deponent Address': grantor_addr,
        'Grantor Address at Time of Sale': grantor_addr,
    }
    writer.update_page_form_field_values(writer.pages[0], fields, auto_regenerate=False)
    with open(output_path, 'wb') as f:
        writer.write(f)

def fill_residency(data, output_path):
    reader = PdfReader(os.path.join(TEMPLATES, 'residency-template.pdf'))
    writer = PdfWriter()
    writer.append(reader)
    deed_date = data.get('signingDate') or '_______________'
    grantor = data.get('grantor', '')
    grantor2 = data.get('grantor2', '')
    full_grantor = (grantor + ' and ' + grantor2) if grantor2 else grantor
    grantor_addr = data.get('grantorAddr', '')
    addr_parts = grantor_addr.split(',')
    street = addr_parts[0].strip() if addr_parts else grantor_addr
    city_state = ', '.join(addr_parts[1:]).strip() if len(addr_parts) > 1 else ''
    prop_addr = data.get('propAddr', '')
    prop_parts = prop_addr.split(',')
    prop_street = prop_parts[0].strip() if prop_parts else prop_addr
    zip_match = re.search(r'\d{5}', prop_addr)
    prop_zip = zip_match.group() if zip_match else ''
    fields = {
        'Name': full_grantor,
        'Add1': street,
        'City Town Post Office': city_state,
        'State': 'NJ',
        'ZIP Code': '',
        'Block': data.get('block', ''),
        'Lot': data.get('lot', ''),
        'Qual': data.get('qualifier', ''),
        'Add2': prop_street,
        'City Town Post Office_2': data.get('municipality', ''),
        'State_2': 'NJ',
        'ZIP Code_2': prop_zip,
        'Sellers Percentage of Ownership': '100%',
        'Total Consideration': '$1.00',
        'Owners Share of Consideration': '$1.00',
        'Closing Date': deed_date,
        'Check Box71a': 'Yes',
        'Check Box72a': 'Yes',
        'Check Box76a': 'Yes',
        'Date': deed_date,
        'Date_2': deed_date,
    }
    writer.update_page_form_field_values(writer.pages[0], fields, auto_regenerate=False)
    with open(output_path, 'wb') as f:
        writer.write(f)

def fill_deed_docx(data, output_path):
    deed_date = data.get('signingDate') or '_______________'
    grantor = data.get('grantor', '')
    grantor2 = data.get('grantor2', '')
    full_grantor = (grantor + ' and ' + grantor2) if grantor2 else grantor
    grantee = data.get('newGrantee', '')
    trustee = data.get('trustee', '')
    trust_date = data.get('trustDate', '')
    grantor_addr = data.get('grantorAddr', '')
    municipality = data.get('municipality', '')
    block = data.get('block', '')
    lot = data.get('lot', '')
    prior_grantees = data.get('priorGrantees', '')
    prior_deed_date = data.get('priorDeedDate', '')
    prior_recorded = data.get('priorRecordedDate', '')
    prior_book = data.get('priorBook', '')
    prior_page = data.get('priorPage', '')
    prepared_by = data.get('preparedBy', '')

    grantee_clause = grantee
    if trust_date:
        grantee_clause += f', a Trust, dated {trust_date}'
    if trustee:
        grantee_clause += f', {trustee}, Trustee'

    template_path = os.path.join(TEMPLATES, 'deed-template.docx')
    with zipfile.ZipFile(template_path, 'r') as zin:
        xml = zin.read('word/document.xml').decode('utf-8')
        all_files = {name: zin.read(name) for name in zin.namelist()}

    replacements = [
        ('May 28 , 20 2 6 ,', deed_date + ','),
        ('May 28 , 2026 ,', deed_date + ','),
        ('May 28, 2026,', deed_date + ','),
        ('May 28 , 2026', deed_date),
        ('William J. Kline, Jr. and Susan E. Kline', full_grantor),
        ('William J. Kline, Jr. and Susan ', full_grantor + ' '),
        ('William J. Kline, Jr.', grantor or 'William J. Kline, Jr.'),
        ('Susan E. Kline', grantor2 or 'Susan E. Kline'),
        ('2 Arlington Avenue in Maple Shade, New Jersey 08052', grantor_addr or '2 Arlington Avenue in Maple Shade, New Jersey 08052'),
        ('Kline Family Living Trust , a Trust, dated May 28 , 2026', grantee_clause),
        ('Kline Family Living Trust', grantee or 'Kline Family Living Trust'),
        ('Maple Shade Township', municipality or 'Maple Shade Township'),
        ('129.11', block or '129.11'),
        ('Lot No. 1', f'Lot No. {lot}' if lot else 'Lot No. 1'),
        ('Lot: 1', f'Lot: {lot}' if lot else 'Lot: 1'),
        ('Block: 129.11', f'Block: {block}' if block else 'Block: 129.11'),
        ('William James Kline, Jr. and Susan Esbensen Kline', prior_grantees or 'William James Kline, Jr. and Susan Esbensen Kline'),
        ('April 16, 1985', prior_deed_date or 'April 16, 1985'),
        ('April 23, 1985', prior_recorded or 'April 23, 1985'),
        ('Deed Book 2990', f'Deed Book {prior_book}' if prior_book else 'Deed Book 2990'),
        ('P age 139', f'Page {prior_page}' if prior_page else 'Page 139'),
        ('May 28 , 2026 , William J. Kline, Jr. and Susan E. Kline', f'{deed_date}, {full_grantor}'),
    ]

    for old, new in replacements:
        if old and new:
            xml = xml.replace(old, new)

    out_buf = io.BytesIO()
    with zipfile.ZipFile(out_buf, 'w', zipfile.ZIP_DEFLATED) as zout:
        for name, content in all_files.items():
            if name == 'word/document.xml':
                zout.writestr(name, xml.encode('utf-8'))
            else:
                zout.writestr(name, content)

    with open(output_path, 'wb') as f:
        f.write(out_buf.getvalue())

if __name__ == '__main__':
    cmd = sys.argv[1]
    data = json.loads(sys.argv[2])
    output_path = sys.argv[4]
    if cmd == 'affidavit':
        fill_affidavit(data, output_path)
    elif cmd == 'residency':
        fill_residency(data, output_path)
    elif cmd == 'deed':
        fill_deed_docx(data, output_path)
    print('OK')
