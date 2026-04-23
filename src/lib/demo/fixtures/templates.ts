export const DEMO_TEMPLATES = [
  {
    id: 1,
    name: 'Default Newsletter Template',
    type: 'campaign',
    body: '<!doctype html><html><body style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;padding:24px;">{{ template "content" . }}</body></html>',
    is_default: true,
    created_at: '2024-09-15T10:00:00Z',
    updated_at: '2024-09-15T10:00:00Z',
  },
  {
    id: 2,
    name: 'Premium Issue Template',
    type: 'campaign',
    body: '<!doctype html><html><body style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#fafafa;">{{ template "content" . }}</body></html>',
    is_default: false,
    created_at: '2024-10-01T10:00:00Z',
    updated_at: '2024-10-01T10:00:00Z',
  },
]
