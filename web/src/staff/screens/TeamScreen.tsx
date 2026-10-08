import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { StaffRole, StaffUser } from '@shared/types';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { KilimBand } from '../../ui/Kilim';
import { Notice, TextField } from '../../ui/primitives';
import { addStaff, removeStaff, StaffApiError } from '../api';
import { ConfirmDialog, PageHeader, Sheet, useStaffToast } from '../components';
import { useStaffListQuery, useStaffMutation } from '../queries';
import { useStaff } from '../session';
import staffStyles from '../staff.module.css';
import styles from './TeamScreen.module.css';

const ROLES: StaffRole[] = ['owner', 'manager', 'waiter'];

/** A temporary password the owner reads out; the person changes it on first sign-in. */
function temporaryPassword() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
  return `${chars.slice(0, 3)}-${chars.slice(3, 6)}-${chars.slice(6, 9)}`;
}

export function TeamScreen() {
  const { t } = useTranslation();
  const team = useStaffListQuery();
  const { user } = useStaff();
  const toast = useStaffToast();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<StaffUser | null>(null);
  const remove = useStaffMutation(removeStaff);

  return (
    <>
      <KilimBand height={10} />
      <div className={staffStyles.content}>
        <PageHeader
          title={t('staff.team.title')}
          actions={
            <Button onClick={() => setAdding(true)}>
              <Icon name="plus" size={18} strokeWidth={2.6} />
              {t('staff.team.add')}
            </Button>
          }
        />

        <div className={styles.roles}>
          {ROLES.map((role) => (
            <div key={role} className={styles.roleCard}>
              <span className={styles.roleBadge} data-role={role}>
                {t(`staff.roles.${role}`)}
              </span>
              <p>{t(`staff.team.roleHint.${role}`)}</p>
            </div>
          ))}
        </div>

        <ul className={styles.list}>
          {(team.data ?? []).map((member) => (
            <li key={member.id} className={styles.member}>
              <span className={styles.avatar} data-role={member.role} aria-hidden>
                {member.name
                  .split(' ')
                  .map((w) => w[0])
                  .join('')
                  .slice(0, 2)}
              </span>
              <span className={styles.who}>
                <strong>
                  {member.name}
                  {member.id === user?.id && <span className={styles.you}> · {t('staff.team.you')}</span>}
                </strong>
                <span>{member.email}</span>
              </span>
              <span className={styles.roleBadge} data-role={member.role}>
                {t(`staff.roles.${member.role}`)}
              </span>
              {member.id !== user?.id && (
                <button type="button" className={styles.remove} onClick={() => setRemoving(member)}>
                  {t('staff.team.remove')}
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>

      <AddMemberSheet open={adding} onClose={() => setAdding(false)} />

      <ConfirmDialog
        open={removing !== null}
        title={t('staff.team.removeTitle', { name: removing?.name ?? '' })}
        body={remove.error instanceof StaffApiError && remove.error.code === 'last_owner' ? t('staff.team.lastOwner') : t('staff.team.removeBody')}
        confirmLabel={t('staff.team.removeConfirm')}
        cancelLabel={t('staff.common.keep')}
        tone="danger"
        busy={remove.isPending}
        onConfirm={() =>
          removing &&
          remove.mutate(removing.id, {
            onSuccess: () => {
              toast(t('staff.team.removed', { name: removing.name }));
              setRemoving(null);
            },
          })
        }
        onClose={() => {
          setRemoving(null);
          remove.reset();
        }}
      />
    </>
  );
}

function AddMemberSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useStaffToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<StaffRole>('waiter');
  const [password, setPassword] = useState(temporaryPassword);
  const [created, setCreated] = useState<StaffUser | null>(null);
  const add = useStaffMutation(addStaff);

  function close() {
    setName('');
    setEmail('');
    setRole('waiter');
    setPassword(temporaryPassword());
    setCreated(null);
    onClose();
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    add.mutate(
      { name: name.trim(), email: email.trim(), role },
      {
        onSuccess: (user) => {
          setCreated(user);
          toast(t('staff.team.added', { name: user.name }));
        },
      },
    );
  }

  return (
    <Sheet open={open} title={t('staff.team.add')} onClose={close}>
      {created ? (
        <div className={styles.created}>
          <Notice icon="lock">{t('staff.team.passwordHint')}</Notice>
          <p className={styles.createdLabel}>{t('staff.team.tempPassword')}</p>
          <p className={styles.password}>{password}</p>
          <Button variant="dark" block onClick={close}>
            {t('staff.common.done')}
          </Button>
        </div>
      ) : (
        <form className={styles.form} onSubmit={submit}>
          <TextField label={t('staff.team.name')} value={name} onChange={(e) => setName(e.target.value)} required autoComplete="off" />
          <TextField label={t('staff.team.email')} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="off" />
          <fieldset className={styles.roleField}>
            <legend>{t('staff.team.role')}</legend>
            {ROLES.map((r) => (
              <label key={r} className={styles.roleOption} data-checked={role === r || undefined}>
                <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} className="visually-hidden" />
                <span className={styles.roleBadge} data-role={r}>
                  {t(`staff.roles.${r}`)}
                </span>
                <span>{t(`staff.team.roleHint.${r}`)}</span>
              </label>
            ))}
          </fieldset>
          <Button type="submit" size="lg" block loading={add.isPending}>
            {t('staff.team.create')}
          </Button>
        </form>
      )}
    </Sheet>
  );
}
