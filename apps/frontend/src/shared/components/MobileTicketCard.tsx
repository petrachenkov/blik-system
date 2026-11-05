import { shortTicketNumber } from '../ticket-number';
import { Tag, Typography } from 'antd';
import { EnvironmentOutlined, RightOutlined, UserOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import type { Ticket } from '../types';
import { PRIORITY_COLORS, PRIORITY_LABELS, STATUS_COLORS, STATUS_LABELS } from '../labels';
import { SlaCountdown } from './SlaCountdown';

export function MobileTicketCard({ ticket, showPriority = false }: { ticket: Ticket; showPriority?: boolean }) {
  const navigate = useNavigate();
  return (
    <button className="mobile-ticket" onClick={() => navigate(`/tickets/${ticket.id}`)}>
      <span className="mobile-ticket__heading">
        <Typography.Text strong>{shortTicketNumber(ticket.number)}</Typography.Text>
        <Tag color={STATUS_COLORS[ticket.status]}>{STATUS_LABELS[ticket.status]}</Tag>
      </span>
      <span className="mobile-ticket__description">{ticket.description}</span>
      <span className="mobile-ticket__meta"><EnvironmentOutlined /> {ticket.location.building}, каб. {ticket.location.room}</span>
      <span className="mobile-ticket__meta"><UserOutlined /> {ticket.assignedTo?.fullName ?? 'Исполнитель пока не назначен'}</span>
      {showPriority && (ticket.isResponseBreached || ticket.isResolutionBreached) && <span><Tag color="red">Срок заявки нарушен</Tag></span>}
      {showPriority && ticket.responseDueAt && <span className="mobile-ticket__meta">Ответ: <SlaCountdown dueAt={ticket.responseDueAt} breached={ticket.isResponseBreached} doneAt={ticket.firstRespondedAt} /></span>}
      <span className="mobile-ticket__footer">
        <span>{dayjs(ticket.createdAt).format('DD.MM · HH:mm')}</span>
        {showPriority && ticket.priority && <Tag color={PRIORITY_COLORS[ticket.priority]}>{PRIORITY_LABELS[ticket.priority]}</Tag>}
        <RightOutlined />
      </span>
    </button>
  );
}
