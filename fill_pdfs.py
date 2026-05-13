#!/usr/bin/env python3
"""Fill PDF templates with deed data. Called from Node.js server."""
import sys, json
from pypdf import PdfReader, PdfWriter
import os

def fill_affidavit(data, template_path, output_path):
    reader = PdfReader(template_path)
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

def fill_residency(data, template_path, output_path):
    reader = PdfReader(template_path)
    writer = PdfWriter()
    writer.append(reader)

    deed_date = data.get('signingDate') or '_______________'
    grantor = data.get('grantor', '')
    grantor2 = data.get('grantor2', '')
    full_grantor = (grantor + ' and ' + grantor2) if grantor2 else grantor
    grantor_addr = data.get('grantorAddr', '')

    # Parse address into parts
    addr_parts = grantor_addr.split(',')
    street = addr_parts[0].strip() if addr_parts else grantor_addr
    city_state_zip = ', '.join(addr_parts[1:]).strip() if len(addr_parts) > 1 else ''

    # Property address parts
    prop_addr = data.get('propAddr', '')
    prop_parts = prop_addr.split(',')
    prop_street = prop_parts[0].strip() if prop_parts else prop_addr
    prop_city = data.get('municipality', '')
    prop_state = 'NJ'
    prop_zip = ''
    # Extract zip if present
    import re
    zip_match = re.search(r'\d{5}', prop_addr)
    if zip_match:
        prop_zip = zip_match.group()

    fields = {
        'Name': full_grantor,
        'Add1': street,
        'City Town Post Office': city_state_zip,
        'State': 'NJ',
        'ZIP Code': '',
        'Block': data.get('block', ''),
        'Lot': data.get('lot', ''),
        'Qual': data.get('qualifier', ''),
        'Add2': prop_street,
        'City Town Post Office_2': prop_city,
        'State_2': prop_state,
        'ZIP Code_2': prop_zip,
        'Sellers Percentage of Ownership': '100%',
        'Total Consideration': '$1.00',
        'Owners Share of Consideration': '$1.00',
        'Closing Date': deed_date,
        # Check boxes 1, 2, 6
        'Check Box71a': 'Yes',   # Box 1
        'Check Box72a': 'Yes',   # Box 2
        'Check Box76a': 'Yes',   # Box 6
        'Date': deed_date,
        'Date_2': deed_date,
    }

    writer.update_page_form_field_values(writer.pages[0], fields, auto_regenerate=False)
    with open(output_path, 'wb') as f:
        writer.write(f)

def fill_deed_docx(data, template_path, output_path):
    """Fill the deed DOCX by replacing values in the XML."""
    import zipfile, shutil, re

    deed_date = data.get('signingDate') or '_______________'
    grantor = data.get('grantor', '')
    grantor2 = data.get('grantor2', '')
    grantee = data.get('newGrantee', '')
    trustee = data.get('trustee', '')
    trust_date = data.get('trustDate', '')
    grantor_addr = data.get('grantorAddr', '')
    municipality = data.get('municipality', '')
    county = data.get('county', 'Burlington')
    block = data.get('block', '')
    lot = data.get('lot', '')
    prop_addr = data.get('propAddr', '')
    legal_desc = data.get('legalDesc', '')
    prior_grantees = data.get('priorGrantees', '')
    prior_deed_date = data.get('priorDeedDate', '')
    prior_recorded = data.get('priorRecordedDate', '')
    prior_book = data.get('priorBook', '')
    prior_page = data.get('priorPage', '')
    prior_county = data.get('priorCounty', 'Burlington')

    # Grantee clause
    grantee_clause = grantee
    if trust_date:
        grantee_clause += f', a Trust, dated {trust_date}'
    if trustee:
        grantee_clause += f', {trustee}, Trustee'

    # Being clause
    being = ''
    if prior_grantees and prior_book:
        being = f'BEING the same premises conveyed to {prior_grantees}, by Deed dated {prior_deed_date} and recorded on {prior_recorded} in the {prior_county} County Clerk/Register\'s Office, in Deed Book {prior_book}, Page {prior_page}.'

    # Full grantor line
    full_grantor = (grantor + ' and ' + grantor2) if grantor2 else grantor

    # Copy template
    shutil.copy(template_path, output_path)

    # Read and modify XML
    with zipfile.ZipFile(output_path, 'r') as z:
        xml = z.read('word/document.xml').decode('utf-8')

    # Helper: replace text preserving XML runs
    # We'll do a text-level replacement on the extracted text, then rebuild
    # Actually, easier: replace specific known values from the Kline template

    replacements = [
        # Deed date
        ('May 28 , 20 2 6', deed_date),
        ('May 28 , 2026', deed_date),
        # Grantor names
        ('William J. Kline, Jr. and Susan E. Kline', full_grantor),
        ('William J. Kline, Jr. and Susan ', full_grantor),
        ('William J. Kline, Jr.', grantor),
        ('Susan E. Kline', grantor2 if grantor2 else ''),
        # Grantor address
        ('2 Arlington Avenue in Maple Shade, New Jersey 08052', grantor_addr),
        ('2 Arlington Avenue in Maple Shade, New Jersey', grantor_addr),
        # Grantee
        ('Kline Family Living Trust , a Trust, dated May 28 , 2026', grantee_clause),
        ('Kline Family Living Trust', grantee),
        # Municipality/County/Block/Lot
        ('Maple Shade Township', municipality),
        ('Burlington', county),
        ('129.11', block),
        ('Block: 129.11', f'Block: {block}'),
        ('Block No. 129.11', f'Block No. {block}'),
        ('Lot No. 1', f'Lot No. {lot}'),
        ('Lot: 1', f'Lot: {lot}'),
        ('Lot number 1', f'Lot number {lot}'),
        # Property address
        ('2 Arlington Avenue in Maple Shade, New Jersey 08052', prop_addr),
        # Prior deed / being clause
        ('William James Kline, Jr. and Susan Esbensen Kline', prior_grantees if prior_grantees else full_grantor),
        ('April 16, 1985', prior_deed_date if prior_deed_date else 'April 16, 1985'),
        ('April 23, 1985', prior_recorded if prior_recorded else 'April 23, 1985'),
        ('Deed Book 2990', f'Deed Book {prior_book}' if prior_book else 'Deed Book 2990'),
        ('P age 139', f'Page {prior_page}' if prior_page else 'Page 139'),
        # Certify date
        ('May 28 , 2026 , William J. Kline, Jr. and Susan E. Kline', f'{deed_date}, {full_grantor}'),
    ]

    # Apply replacements to text content (strip XML tags first approach won't work well)
    # Better: do regex replacements on the raw XML text nodes
    for old, new in replacements:
        if old and new:
            # Escape for XML
            new_escaped = new.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
            # Try direct replacement first (works when text is in single run)
            xml = xml.replace(old, new)

    # Also replace legal description
    if legal_desc:
        # Find and replace the legal description block
        # The legal desc starts after "Legal Description" heading
        old_legal = 'ALL THAT CERTAIN land and premises situate in the Township of Maple Shade'
        if old_legal in xml:
            # Find the full legal desc in XML - it's complex, so just do the beginning
            pass

    # Write back
    import io
    buf = io.BytesIO()
    with zipfile.ZipFile(output_path, 'r') as zin:
        with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zout:
            for item in zin.infolist():
                if item.filename == 'word/document.xml':
                    zout.writestr(item, xml.encode('utf-8'))
                else:
                    zout.writestr(item, zin.read(item.filename))

    with open(output_path, 'wb') as f:
        f.write(buf.getvalue())

if __name__ == '__main__':
    cmd = sys.argv[1]
    data = json.loads(sys.argv[2])
    template_dir = sys.argv[3]
    output_path = sys.argv[4]

    if cmd == 'affidavit':
        fill_affidavit(data, os.path.join(template_dir, 'affidavit-template.pdf'), output_path)
    elif cmd == 'residency':
        fill_residency(data, os.path.join(template_dir, 'residency-template.pdf'), output_path)
    elif cmd == 'deed':
        fill_deed_docx(data, os.path.join(template_dir, 'deed-template.docx'), output_path)

    print('OK')
