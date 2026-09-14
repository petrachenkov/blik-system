-- Отдельные последовательности для человекочитаемых номеров заявок и отчётов на заправку
-- картриджей (CART-000123, REPORT-000045) — по образцу ticket_number_seq. Prisma-схема не
-- позволяет декларативно описать самостоятельный db sequence, поэтому создаются вручную.
CREATE SEQUENCE IF NOT EXISTS cartridge_request_number_seq START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS cartridge_report_number_seq START WITH 1 INCREMENT BY 1;
