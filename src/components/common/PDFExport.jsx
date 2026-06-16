// components/common/PDFExport.jsx
import React from 'react';
import { generatePDF, formatCurrencyWithRate, getSystemConfig } from '../../data/store';

export const PDFExport = {
  async generateInvoicePDF(invoice, company) {
    const config = getSystemConfig();
    const data = {
      type: 'invoice',
      title: 'INVOICE',
      number: invoice.number,
      date: new Date(invoice.date).toLocaleDateString(),
      dueDate: new Date(invoice.dueDate).toLocaleDateString(),
      company: {
        name: company?.name || config.companyName,
        email: company?.email,
        phone: company?.phone,
        address: company?.address,
        taxId: company?.taxId
      },
      customer: {
        name: invoice.companyName,
        address: invoice.billingAddress
      },
      items: invoice.lineItems,
      subtotal: invoice.subtotal,
      taxRate: invoice.taxRate,
      taxAmount: invoice.taxAmount,
      total: invoice.total,
      notes: invoice.notes,
      currency: config.currency
    };
    
    return generatePDF('invoice', data);
  },

  async generateQuotationPDF(quotation, company) {
    const config = getSystemConfig();
    const data = {
      type: 'quotation',
      title: 'QUOTATION',
      number: quotation.number,
      date: new Date(quotation.date).toLocaleDateString(),
      validUntil: new Date(quotation.validUntil).toLocaleDateString(),
      company: {
        name: company?.name || config.companyName,
        email: company?.email,
        phone: company?.phone,
        address: company?.address
      },
      customer: {
        name: quotation.companyName
      },
      items: quotation.lineItems,
      subtotal: quotation.subtotal,
      taxRate: quotation.taxRate,
      taxAmount: quotation.taxAmount,
      total: quotation.total,
      notes: quotation.notes,
      currency: config.currency
    };
    
    return generatePDF('quotation', data);
  },

  async generateSalesOrderPDF(salesOrder, company) {
    const config = getSystemConfig();
    const data = {
      type: 'sales_order',
      title: 'SALES ORDER',
      number: salesOrder.number,
      date: new Date(salesOrder.date).toLocaleDateString(),
      expectedDelivery: new Date(salesOrder.expectedDelivery).toLocaleDateString(),
      company: {
        name: company?.name || config.companyName
      },
      customer: {
        name: salesOrder.companyName
      },
      items: salesOrder.lineItems,
      subtotal: salesOrder.subtotal,
      taxRate: salesOrder.taxRate,
      taxAmount: salesOrder.taxAmount,
      total: salesOrder.total,
      notes: salesOrder.notes,
      currency: config.currency
    };
    
    return generatePDF('sales_order', data);
  },

  downloadPDF(blob, filename) {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  }
};