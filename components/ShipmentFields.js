import { FIELDS } from '@/lib/dsr';

// All DSR inputs, used by both the "add shipment" form and the edit page.
export default function ShipmentFields({ values = {} }) {
  return (
    <div className="dsr-form">
      {FIELDS.map((f) => {
        const v = values[f.key] ?? '';
        return (
          <label key={f.key}>{f.label}
            {f.options ? (
              <select name={f.key} defaultValue={v}>
                <option value="">—</option>
                {f.options.map((o) => <option key={o}>{o}</option>)}
              </select>
            ) : (
              <input
                name={f.key} defaultValue={v} type={f.date ? 'date' : f.num ? 'number' : 'text'}
                min={f.num ? 0 : undefined} list={f.suggest ? `dl-${f.key}` : undefined} autoComplete="off"
              />
            )}
            {f.suggest && <datalist id={`dl-${f.key}`}>{f.suggest.map((o) => <option key={o} value={o} />)}</datalist>}
          </label>
        );
      })}
    </div>
  );
}
