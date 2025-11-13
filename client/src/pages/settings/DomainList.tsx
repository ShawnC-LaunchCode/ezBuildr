import React, { useState } from 'react';
import { useTenantDomains, useAddTenantDomain, useRemoveTenantDomain } from '../../hooks/useBrandingAPI';

/**
 * Stage 17: Domain List Component (PLACEHOLDER)
 *
 * Minimal UI for managing custom tenant domains.
 * This is a scaffolding component - final UI design will be implemented later.
 */

interface DomainListProps {
  tenantId: string;
}

export function DomainList({ tenantId }: DomainListProps) {
  const { data: domains, isLoading, error } = useTenantDomains(tenantId);
  const addDomain = useAddTenantDomain(tenantId);
  const removeDomain = useRemoveTenantDomain(tenantId);

  const [newDomain, setNewDomain] = useState('');

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newDomain.trim()) {
      alert('Please enter a domain');
      return;
    }

    try {
      await addDomain.mutateAsync(newDomain.trim());
      setNewDomain('');
      alert('Domain added successfully');
    } catch (error: any) {
      alert(`Failed to add domain: ${error.message}`);
    }
  };

  const handleRemove = async (domainId: string) => {
    if (!confirm('Are you sure you want to remove this domain?')) {
      return;
    }

    try {
      await removeDomain.mutateAsync(domainId);
      alert('Domain removed successfully');
    } catch (error: any) {
      alert(`Failed to remove domain: ${error.message}`);
    }
  };

  if (isLoading) {
    return <div className="p-4">Loading domains...</div>;
  }

  if (error) {
    return <div className="p-4 text-red-600">Error loading domains: {error.message}</div>;
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold mb-6">Custom Domains</h2>
      <p className="text-gray-600 mb-4">
        Configure custom domains for your tenant. This is a placeholder UI - final design coming soon.
      </p>

      {/* Add Domain Form */}
      <form onSubmit={handleAdd} className="mb-6">
        <label className="block text-sm font-medium mb-2">Add New Domain</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            placeholder="acme.vaultlogic.com"
            className="flex-1 px-3 py-2 border rounded"
          />
          <button
            type="submit"
            disabled={addDomain.isPending}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {addDomain.isPending ? 'Adding...' : 'Add'}
          </button>
        </div>
      </form>

      {/* Domain List */}
      <div className="space-y-2">
        <h3 className="text-lg font-semibold mb-2">Configured Domains</h3>
        {!domains || domains.length === 0 ? (
          <p className="text-gray-500 italic">No custom domains configured</p>
        ) : (
          <ul className="space-y-2">
            {domains.map((domain) => (
              <li
                key={domain.id}
                className="flex items-center justify-between p-3 border rounded bg-gray-50"
              >
                <div>
                  <p className="font-medium">{domain.domain}</p>
                  <p className="text-sm text-gray-500">
                    Added {new Date(domain.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => handleRemove(domain.id)}
                  disabled={removeDomain.isPending}
                  className="px-3 py-1 text-red-600 border border-red-600 rounded hover:bg-red-50 disabled:opacity-50"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
