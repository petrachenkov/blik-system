import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { HorizontalBarChart } from '../../shared/charts/HorizontalBarChart';
import { fetchWallboardSnapshot } from '../../shared/api/wallboard';

const QUEUE_LABELS: Record<string, string> = {
  NEW: 'Новые',
  ASSIGNED: 'Назначенные',
  IN_PROGRESS: 'В работе',
  REOPENED: 'Переоткрытые',
};

const BG = '#0b1220';
const PANEL = '#131c2e';
const ACCENT = '#3b82f6';

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return <span>{dayjs(now).format('HH:mm:ss')}</span>;
}

function Tile({ label, value, accent }: { label: string; value: number | string; accent?: string }) {
  return (
    <div style={{ background: PANEL, borderRadius: 16, padding: '20px 24px', flex: '1 1 160px', minWidth: 150 }}>
      <div style={{ fontSize: 48, fontWeight: 800, lineHeight: 1, color: accent ?? '#fff' }}>{value}</div>
      <div style={{ fontSize: 15, color: '#94a3b8', marginTop: 8 }}>{label}</div>
    </div>
  );
}

export function WallboardPage() {
  const [params] = useSearchParams();
  const kioskToken = params.get('k');

  const { data, error, dataUpdatedAt } = useQuery({
    queryKey: ['wallboard', kioskToken],
    queryFn: () => fetchWallboardSnapshot(kioskToken),
    refetchInterval: 15_000,
    retry: false,
  });

  const [stale, setStale] = useState(false);
  useEffect(() => {
    const id = setInterval(() => setStale(Date.now() - dataUpdatedAt > 60_000), 5000);
    return () => clearInterval(id);
  }, [dataUpdatedAt]);

  const chart = useMemo(() => {
    if (!data) return null;
    const rows = data.workload.slice(0, 12);
    return {
      categories: rows.map((w) => w.fullName),
      values: rows.map((w) => w.activeCount),
      colors: rows.map((w) => (w.activeCount > 7 ? '#ef4444' : w.activeCount > 3 ? '#f59e0b' : '#22c55e')),
    };
  }, [data]);

  if (error) {
    return (
      <div style={{ minHeight: '100vh', background: BG, color: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 40 }}>
        <div>
          <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 12 }}>Панель недоступна</div>
          <div style={{ color: '#94a3b8', maxWidth: 480 }}>
            Откройте панель по kiosk-ссылке из раздела «Настенная панель» в админке, либо войдите под учётной записью сотрудника.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: BG, color: '#e2e8f0', padding: 32, fontSize: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 24 }}>
        <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: 0.5 }}>Blik · дежурная панель</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: stale ? '#ef4444' : '#94a3b8' }}>
          {stale ? 'нет связи · ' : ''}
          <Clock />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
        {data &&
          Object.entries(data.queue).map(([key, value]) => (
            <Tile key={key} label={QUEUE_LABELS[key] ?? key} value={value} />
          ))}
        <Tile label="Не назначено" value={data?.unassignedCount ?? 0} accent={data && data.unassignedCount > 0 ? '#f59e0b' : undefined} />
        <Tile label="Решено сегодня" value={data?.resolvedToday ?? 0} accent="#22c55e" />
      </div>

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ background: PANEL, borderRadius: 16, padding: 24, flex: '1 1 420px', minWidth: 320 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: data && data.overdue.count > 0 ? '#ef4444' : '#94a3b8', marginBottom: 12 }}>
            Просрочено: {data?.overdue.count ?? 0}
          </div>
          {data && data.overdue.items.length === 0 && <div style={{ color: '#64748b' }}>Просроченных заявок нет</div>}
          {data?.overdue.items.map((item) => (
            <div key={item.number} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(148,163,184,0.12)' }}>
              <span style={{ fontWeight: 600 }}>{item.number}</span>
              <span style={{ color: '#94a3b8' }}>{item.assignee ?? 'не назначен'}</span>
              <span style={{ color: '#ef4444' }}>{item.breachType === 'resolution' ? 'решение' : 'реакция'}</span>
            </div>
          ))}
        </div>

        <div style={{ background: PANEL, borderRadius: 16, padding: 24, flex: '1 1 420px', minWidth: 320 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#94a3b8', marginBottom: 12 }}>Визиты сегодня</div>
          {data && data.visitsToday.length === 0 && <div style={{ color: '#64748b' }}>На сегодня визитов нет</div>}
          {data?.visitsToday.map((v, i) => (
            <div
              key={`${v.number}-${i}`}
              style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: '1px solid rgba(148,163,184,0.12)' }}
            >
              <span style={{ fontWeight: 700, color: '#38bdf8', minWidth: 54 }}>{v.time}</span>
              <span style={{ fontWeight: 600, minWidth: 120 }}>{v.number}</span>
              <span style={{ color: '#94a3b8', flex: 1 }}>{v.location}</span>
              <span style={{ color: '#94a3b8' }}>{v.technician}</span>
            </div>
          ))}
        </div>

        <div style={{ background: PANEL, borderRadius: 16, padding: 24, flex: '1 1 420px', minWidth: 320 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#94a3b8', marginBottom: 12 }}>Загрузка исполнителей</div>
          {chart && chart.categories.length > 0 ? (
            <div style={{ color: '#e2e8f0' }}>
              <HorizontalBarChart
                categories={chart.categories}
                series={[{ key: 'active', label: 'Активные заявки', color: ACCENT, values: chart.values, colors: chart.colors }]}
                integerAxis
                axisColor="rgba(148,163,184,0.3)"
                textColor="#e2e8f0"
                mutedColor="#94a3b8"
              />
            </div>
          ) : (
            <div style={{ color: '#64748b' }}>Активных заявок у исполнителей нет</div>
          )}
        </div>
      </div>
    </div>
  );
}
