-- Отдельная последовательность для человекочитаемых номеров заявок (BLIK-000123).
-- Не привязана к конкретной колонке через autoincrement(), поэтому создаётся вручную:
-- Prisma-схема не позволяет декларативно описать самостоятельный db sequence.
CREATE SEQUENCE IF NOT EXISTS ticket_number_seq START WITH 1 INCREMENT BY 1;
