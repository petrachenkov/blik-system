`russian-trusted-ca.pem` — публичный пакет CA для TLS API MAX, загруженный с
https://gu-st.ru/content/Other/doc/russiantrustedca.pem (Госуслуги) 2026-11-02.

Dockerfile подключает пакет через `NODE_EXTRA_CA_CERTS`, дополняя стандартное
хранилище Node.js. При обновлении сертификатов замените файл из официального
источника и пересоберите backend.
