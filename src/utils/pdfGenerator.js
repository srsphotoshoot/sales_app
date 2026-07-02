import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export const generateOrderPdf = async (order, type = 'receipt') => {
    try {
        const doc = new jsPDF();
        const isChallan = type === 'challan';
        const accentColor = isChallan ? [245, 158, 11] : [16, 185, 129]; // Amber vs Emerald
        const companyName = (import.meta.env.VITE_COMPANY_NAME || 'SHREE RADHA STUDIO').toUpperCase();

        // Header
        doc.setFontSize(22);
        doc.setTextColor(30, 41, 59); // Slate 800
        doc.setFont('helvetica', 'bold');
        doc.text(companyName, 105, 20, { align: 'center' });
        
        doc.setFontSize(14);
        doc.setTextColor(...accentColor);
        doc.text(isChallan ? 'DISPATCH CHALLAN' : 'SALE ORDER RECEIPT', 105, 28, { align: 'center' });

        // Order Info Block
        doc.setFontSize(10);
        doc.setTextColor(100, 116, 139); // Slate 500
        doc.setDrawColor(226, 232, 240); // Slate 200
        doc.line(15, 35, 195, 35);
        
        doc.setFontSize(11);
        doc.setTextColor(30, 41, 59);
        doc.setFont('helvetica', 'bold');
        doc.text('ORDER INFO', 15, 45);
        doc.setFont('helvetica', 'normal');
        doc.text(`Order ID: ${order.orderId}`, 15, 52);
        doc.text(`Date: ${new Date(order.timestamp).toLocaleString()}`, 15, 59);
        doc.text(`Salesperson: ${order.createdBy || 'Office'}`, 15, 66);

        // Customer Info Block
        doc.setFont('helvetica', 'bold');
        doc.text('CUSTOMER INFO', 110, 45);
        doc.setFont('helvetica', 'normal');
        doc.text(`Name: ${order.customer.name}`, 110, 52);
        doc.text(`Contact: ${order.customer.contact || 'N/A'}`, 110, 59);
        doc.text(`Address: ${order.customer.address || 'N/A'}`, 110, 66);
        if (!isChallan) doc.text(`GST: ${order.customer.gst || 'N/A'}`, 110, 73);

        // Only include sale items in the table; interest items are excluded from both receipt and challan
        const saleCart = order.cart.filter(item => item.type !== 'interest');

        const tableData = saleCart.map(item => {
            const row = [item.name, item.color, item.qty];
            if (!isChallan) {
                row.push(`INR ${item.rate}`);
                row.push(`INR ${item.rate * item.qty}`);
            }
            return row;
        });

        const head = ['Product Name', 'Color', 'Qty'];
        if (!isChallan) head.push('Rate', 'Amount');

        autoTable(doc, {
            startY: 85,
            head: [head],
            body: tableData,
            theme: 'grid',
            headStyles: { fillColor: accentColor, textColor: 255, fontStyle: 'bold' },
            styles: { fontSize: 10, cellPadding: 5 },
            columnStyles: {
                2: { halign: 'center' },
                3: { halign: 'right' },
                4: { halign: 'right' }
            }
        });

        const tableEndY = doc.lastAutoTable.finalY + 15;
        const pageHeight = doc.internal.pageSize.getHeight();

        if (!isChallan) {
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            const payableValue = saleCart.reduce((sum, item) => sum + (item.rate * (item.qty || 1)), 0);
            doc.text(`Grand Total (Sales Only): INR ${payableValue}`, 195, tableEndY, { align: 'right' });
        } else {
            doc.line(20, tableEndY + 20, 80, tableEndY + 20);
            doc.text('Receiver Signature', 50, tableEndY + 28, { align: 'center' });
            doc.line(130, tableEndY + 20, 190, tableEndY + 20);
            doc.text('Authorized Signature', 160, tableEndY + 28, { align: 'center' });
        }

        const footerY = Math.max(tableEndY + 45, pageHeight - 12);
        doc.setFontSize(9);
        doc.setTextColor(150);
        doc.text(`Thank you for choosing ${companyName}.`, 105, footerY, { align: 'center' });

        const fileName = `${isChallan ? 'CHALLAN' : 'ORDER'}-${order.orderId}.pdf`;
        const pdfBase64 = doc.output('datauristring').split(',')[1];
        
        await Filesystem.writeFile({
            path: fileName,
            data: pdfBase64,
            directory: Directory.Cache
        });

        const savedFile = await Filesystem.getUri({
            path: fileName,
            directory: Directory.Cache
        });

        await Share.share({
            title: `Share ${isChallan ? 'Challan' : 'Receipt'}`,
            text: `PDF for Order ${order.orderId}`,
            url: savedFile.uri,
            dialogTitle: 'Save or Share PDF'
        });

    } catch (err) {
        console.error('PDF Generation Error:', err);
        throw err;
    }
};
