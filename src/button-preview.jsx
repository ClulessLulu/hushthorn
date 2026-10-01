import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import EnamelButton from './components/EnamelButton';
function Preview() {
  const [saving, setSaving] = useState(false);
  const [count, setCount] = useState(0);
  return <main style={{maxWidth:800,margin:'auto',padding:24}}>
    <h1>Hushthorn · button review</h1>
    <p>Tab to check focus. Press Save to check the loading state.</p>
    {['primary','secondary','quiet','metal'].map(variant => <section key={variant} style={{marginBottom:28}}>
      <h2>{variant}</h2>
      <div className="ht-enamel-actions">
        <EnamelButton variant={variant} onClick={() => setCount(count+1)}>Inscribe</EnamelButton>
        <EnamelButton variant={variant} disabled>Unavailable</EnamelButton>
        <EnamelButton variant={variant} loading={saving} onClick={() => {setSaving(true);setTimeout(() => setSaving(false),1500);}}>Save</EnamelButton>
      </div>
    </section>)}
    <div className="ht-enamel-actions"><EnamelButton>Inscribe to Owned</EnamelButton><EnamelButton variant="secondary">Inscribe to Wishlist</EnamelButton></div>
    <p role="status">Actions: {count}</p>
  </main>;
}
createRoot(document.getElementById('root')).render(<Preview/>);
