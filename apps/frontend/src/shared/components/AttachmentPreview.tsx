import { useEffect, useState } from 'react';
import { Image, Skeleton, Tag } from 'antd';
import { PaperClipOutlined } from '@ant-design/icons';
import { apiClient } from '../api/client';

interface AttachmentLike {
  id: string;
  filename: string;
  mimeType: string;
}

/**
 * Эндпоинт скачивания вложения защищён JwtAuthGuard, поэтому обычный <img src="..."> или
 * <a href="..."> не сработает — браузер не приложит Authorization-заголовок. Забираем файл
 * через авторизованный apiClient как blob и отображаем/скачиваем уже через object URL.
 * downloadUrl — относительный путь эндпоинта скачивания (у заявок и у статей БЗ разный
 * префикс, см. shared/api/tickets.ts::attachmentDownloadUrl и shared/api/knowledge.ts).
 */
export function AttachmentPreview({ downloadUrl, attachment }: { downloadUrl: string; attachment: AttachmentLike }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    apiClient
      .get(downloadUrl, { responseType: 'blob' })
      .then((res) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(res.data as Blob);
        setUrl(objectUrl);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [downloadUrl]);

  if (attachment.mimeType.startsWith('image/')) {
    return url ? (
      <Image src={url} width={100} height={100} style={{ objectFit: 'cover', borderRadius: 4 }} />
    ) : (
      <Skeleton.Image active style={{ width: 100, height: 100 }} />
    );
  }

  if (attachment.mimeType.startsWith('video/')) {
    return url ? (
      // eslint-disable-next-line jsx-a11y/media-has-caption
      <video src={url} controls style={{ maxWidth: 260, maxHeight: 180, borderRadius: 4 }} />
    ) : (
      <Skeleton.Image active style={{ width: 200, height: 120 }} />
    );
  }

  return (
    <a href={url ?? undefined} download={attachment.filename} target="_blank" rel="noreferrer">
      <Tag icon={<PaperClipOutlined />}>{attachment.filename}</Tag>
    </a>
  );
}
