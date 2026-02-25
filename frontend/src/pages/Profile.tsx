import React, { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import * as api from '../api';
import type { Collection } from '../types';
import { User, Lock, Save, X, Key, Trash2, Copy, Eye, EyeOff, Terminal, Sparkles } from 'lucide-react';
import { ConfirmModal } from '../components/ConfirmModal';
import { USER_KEY } from '../utils/impersonation';
import { getPasswordPolicy, validatePassword } from '../utils/passwordPolicy';
import { PasswordRequirements } from '../components/PasswordRequirements';

export const Profile: React.FC = () => {
    const { user: authUser, logout, authEnabled } = useAuth();
    const navigate = useNavigate();
    const mustResetPassword = Boolean(authUser?.mustResetPassword);
    const passwordPolicy = getPasswordPolicy();
    const [collections, setCollections] = useState<Collection[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [showEmailForm, setShowEmailForm] = useState(false);
    const [emailCurrentPassword, setEmailCurrentPassword] = useState('');
    const [emailLoading, setEmailLoading] = useState(false);

    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPasswordForm, setShowPasswordForm] = useState(false);

    // API Keys state
    const [apiKeys, setApiKeys] = useState<api.ApiKeyInfo[]>([]);
    const [apiKeyName, setApiKeyName] = useState('');
    const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);
    const [apiKeyLoading, setApiKeyLoading] = useState(false);
    const [apiKeyDeleteConfirm, setApiKeyDeleteConfirm] = useState<string | null>(null);
    const [showNewKey, setShowNewKey] = useState(false);

    // AI Settings state
    const [aiProvider, setAiProvider] = useState('openai');
    const [aiApiKey, setAiApiKey] = useState('');
    const [aiModel, setAiModel] = useState('gpt-5-mini');
    const [aiConfigured, setAiConfigured] = useState(false);
    const [aiLoading, setAiLoading] = useState(false);
    const [showAiKey, setShowAiKey] = useState(false);

    useEffect(() => {
        if (authEnabled === false) {
            navigate('/settings', { replace: true });
            return;
        }
        const fetchData = async () => {
            try {
                const collectionsData = await api.getCollections();
                setCollections(collectionsData);
                
                if (authUser) {
                    setName(authUser.name);
                    setEmail(authUser.email);
                }
            } catch (err) {
                console.error('Failed to fetch data:', err);
            }
        };
        fetchData();
        api.listApiKeys().then(setApiKeys).catch(console.error);
        api.getAiSettings().then((settings) => {
            setAiConfigured(settings.configured);
            if (settings.provider) setAiProvider(settings.provider);
            if (settings.model) setAiModel(settings.model);
        }).catch(console.error);
    }, [authEnabled, authUser, navigate]);

    useEffect(() => {
        if (mustResetPassword) {
            setShowPasswordForm(true);
        }
    }, [mustResetPassword]);

    const handleSelectCollection = (id: string | null | undefined) => {
        if (id === undefined) navigate('/');
        else if (id === null) navigate('/collections?id=unorganized');
        else navigate(`/collections?id=${id}`);
    };

    const handleCreateCollection = async (name: string) => {
        await api.createCollection(name);
        const newCollections = await api.getCollections();
        setCollections(newCollections);
    };

    const handleEditCollection = async (id: string, name: string) => {
        setCollections(prev => prev.map(c => c.id === id ? { ...c, name } : c));
        await api.updateCollection(id, name);
    };

    const handleDeleteCollection = async (id: string) => {
        setCollections(prev => prev.filter(c => c.id !== id));
        await api.deleteCollection(id);
    };

    const handleUpdateName = async () => {
        if (mustResetPassword) {
            setError('You must reset your password before updating your profile');
            return;
        }
        if (!name.trim()) {
            setError('Name cannot be empty');
            return;
        }

        setLoading(true);
        setError('');
        setSuccess('');

        try {
            const response = await api.api.put<{ user: { id: string; email: string; name: string; createdAt: string; updatedAt: string } }>('/auth/profile', { name: name.trim() });
            setSuccess('Name updated successfully');
            if (response.data?.user) {
                localStorage.setItem('mermaiddash-user', JSON.stringify(response.data.user));
                setTimeout(() => window.location.reload(), 500);
            }
        } catch (err: unknown) {
            let message = 'Failed to update name';
            if (api.isAxiosError(err)) {
                if (err.response?.data?.message) {
                    message = err.response.data.message;
                } else if (err.response?.data?.error) {
                    message = err.response.data.error;
                }
            }
            setError(message);
        } finally {
            setLoading(false);
        }
    };

    const handleChangePassword = async () => {
        if (!currentPassword || !newPassword || !confirmPassword) {
            setError('All password fields are required');
            return;
        }

        const passwordError = validatePassword(newPassword, passwordPolicy);
        if (passwordError) {
            setError(passwordError);
            return;
        }

        if (newPassword !== confirmPassword) {
            setError('New passwords do not match');
            return;
        }

        setLoading(true);
        setError('');
        setSuccess('');

        try {
            await api.api.post('/auth/change-password', {
                currentPassword,
                newPassword,
            });
            setSuccess('Password changed successfully');
            setShowPasswordForm(false);
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
            setTimeout(() => {
                logout();
                navigate('/login');
            }, 2000);
        } catch (err: unknown) {
            let message = 'Failed to change password';
            if (api.isAxiosError(err)) {
                if (err.response?.data?.message) {
                    message = err.response.data.message;
                } else if (err.response?.data?.error) {
                    message = err.response.data.error;
                }
            }
            setError(message);
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateEmail = async () => {
        if (mustResetPassword) {
            setError('You must reset your password before changing your email');
            return;
        }
        if (!email.trim()) {
            setError('Email cannot be empty');
            return;
        }
        if (!emailCurrentPassword) {
            setError('Current password is required to change email');
            return;
        }

        setEmailLoading(true);
        setError('');
        setSuccess('');

        try {
            const response = await api.api.put<{
                user: { id: string; email: string; name: string; createdAt: string; updatedAt: string };
            }>('/auth/email', {
                email: email.trim(),
                currentPassword: emailCurrentPassword,
            });

            localStorage.setItem(USER_KEY, JSON.stringify(response.data.user));

            setSuccess('Email updated successfully');
            setShowEmailForm(false);
            setEmailCurrentPassword('');

            setTimeout(() => window.location.reload(), 500);
        } catch (err: unknown) {
            let message = 'Failed to update email';
            if (api.isAxiosError(err)) {
                if (err.response?.data?.message) {
                    message = err.response.data.message;
                } else if (err.response?.data?.error) {
                    message = err.response.data.error;
                }
            }
            setError(message);
        } finally {
            setEmailLoading(false);
        }
    };

    const handleCreateApiKey = async () => {
        if (!apiKeyName.trim()) return;
        setApiKeyLoading(true);
        try {
            const result = await api.createApiKey(apiKeyName.trim());
            setNewlyCreatedKey(result.key);
            setShowNewKey(true);
            setApiKeyName('');
            const keys = await api.listApiKeys();
            setApiKeys(keys);
        } catch (err) {
            console.error('Failed to create API key:', err);
        } finally {
            setApiKeyLoading(false);
        }
    };

    const handleDeleteApiKey = async (id: string) => {
        try {
            await api.deleteApiKey(id);
            setApiKeys(prev => prev.filter(k => k.id !== id));
            setApiKeyDeleteConfirm(null);
        } catch (err) {
            console.error('Failed to delete API key:', err);
        }
    };

    const handleSaveAiSettings = async () => {
        if (!aiApiKey.trim()) return;
        setAiLoading(true);
        setError('');
        try {
            const result = await api.updateAiSettings({
                provider: aiProvider,
                apiKey: aiApiKey,
                model: aiModel,
            });
            setAiConfigured(result.configured);
            setAiApiKey('');
            setShowAiKey(false);
            setSuccess('AI settings saved successfully');
        } catch (err: any) {
            console.error('Failed to save AI settings:', err);
            const serverMsg = err?.response?.data?.error;
            setError(serverMsg || 'Failed to save AI settings');
        } finally {
            setAiLoading(false);
        }
    };

    const handleDeleteAiSettings = async () => {
        setAiLoading(true);
        try {
            await api.deleteAiSettings();
            setAiConfigured(false);
            setAiApiKey('');
            setAiModel('gpt-5-mini');
            setAiProvider('openai');
            setSuccess('AI settings removed');
        } catch (err) {
            console.error('Failed to delete AI settings:', err);
            setError('Failed to remove AI settings');
        } finally {
            setAiLoading(false);
        }
    };

    return (
        <Layout
            collections={collections}
            selectedCollectionId="PROFILE"
            onSelectCollection={handleSelectCollection}
            onCreateCollection={handleCreateCollection}
            onEditCollection={handleEditCollection}
            onDeleteCollection={handleDeleteCollection}
        >
            <h1 className="text-3xl sm:text-5xl mb-6 sm:mb-8 text-slate-900 dark:text-white pl-1 font-brand">
                Profile
            </h1>

            {success && (
                <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/20 border-2 border-green-200 dark:border-green-800 rounded-xl">
                    <p className="text-green-800 dark:text-green-200 font-medium">{success}</p>
                </div>
            )}
            {error && (
                <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-xl">
                    <p className="text-red-800 dark:text-red-200 font-medium">{error}</p>
                </div>
            )}

            <div className="space-y-6">
                <div className="bg-white dark:bg-neutral-900 border-2 border-black dark:border-neutral-700 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] p-6">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-12 h-12 bg-accent/10 dark:bg-neutral-800 rounded-xl flex items-center justify-center border-2 border-accent/15 dark:border-neutral-700">
                            <User size={24} className="text-accent" />
                        </div>
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Personal Information</h2>
                    </div>

                            {mustResetPassword && (
                                <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-200 dark:border-amber-800 rounded-xl">
                                    <p className="text-amber-900 dark:text-amber-200 font-bold">
                                        Password reset required
                                    </p>
                                    <p className="text-sm text-amber-800 dark:text-amber-200/80 font-medium mt-1">
                                        Change your password below before using MermaidDash.
                                    </p>
                                </div>
                            )}
		                    <div className="space-y-4">
	                        <div>
	                            <label htmlFor="email" className="block text-sm font-bold text-slate-700 dark:text-neutral-300 mb-2">
	                                Email Address
	                            </label>
	                            <div className="flex gap-3">
	                                <input
	                                    id="email"
	                                    type="email"
	                                    value={email}
	                                    onChange={(e) => setEmail(e.target.value)}
	                                    disabled={!showEmailForm}
	                                    className={
	                                        showEmailForm
	                                            ? "flex-1 px-4 py-3 bg-white dark:bg-neutral-800 border-2 border-black dark:border-neutral-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent font-medium"
	                                            : "flex-1 px-4 py-3 bg-slate-50 dark:bg-neutral-800 border-2 border-slate-200 dark:border-neutral-700 rounded-xl text-slate-600 dark:text-neutral-400 cursor-not-allowed"
	                                    }
	                                />
		                                {!showEmailForm && (
		                                    <button
		                                        onClick={() => {
		                                            setShowEmailForm(true);
		                                            setEmailCurrentPassword('');
		                                            setError('');
		                                            setSuccess('');
		                                        }}
                                                disabled={mustResetPassword}
		                                        className="px-6 py-3 bg-white dark:bg-neutral-800 text-slate-700 dark:text-neutral-300 font-bold rounded-xl border-2 border-black dark:border-neutral-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-0.5 transition-all duration-200"
		                                    >
		                                        Change
		                                    </button>
		                                )}
	                            </div>

	                            {showEmailForm && (
	                                <div className="mt-4 space-y-3">
	                                    <div>
	                                        <label htmlFor="emailCurrentPassword" className="block text-sm font-bold text-slate-700 dark:text-neutral-300 mb-2">
	                                            Current Password
	                                        </label>
	                                        <input
	                                            id="emailCurrentPassword"
	                                            type="password"
	                                            value={emailCurrentPassword}
	                                            onChange={(e) => setEmailCurrentPassword(e.target.value)}
	                                            className="w-full px-4 py-3 bg-white dark:bg-neutral-800 border-2 border-black dark:border-neutral-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent font-medium"
	                                            placeholder="Enter current password"
	                                        />
	                                    </div>
	                                    <div className="flex gap-3">
	                                        <button
	                                            onClick={handleUpdateEmail}
	                                            disabled={
	                                                emailLoading ||
	                                                !email.trim() ||
	                                                !emailCurrentPassword ||
	                                                email.trim() === authUser?.email
	                                            }
	                                            className="flex-1 px-6 py-3 bg-accent text-white font-bold rounded-xl border-2 border-black dark:border-neutral-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
	                                        >
	                                            {emailLoading ? 'Saving...' : 'Save Email'}
	                                        </button>
	                                        <button
	                                            onClick={() => {
	                                                setShowEmailForm(false);
	                                                setEmail(authUser?.email || '');
	                                                setEmailCurrentPassword('');
	                                                setError('');
	                                            }}
	                                            disabled={emailLoading}
	                                            className="px-6 py-3 bg-white dark:bg-neutral-800 text-slate-700 dark:text-neutral-300 font-bold rounded-xl border-2 border-black dark:border-neutral-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
	                                        >
	                                            <X size={18} />
	                                            Cancel
	                                        </button>
	                                    </div>
	                                </div>
	                            )}
	                        </div>

                        <div>
                            <label htmlFor="name" className="block text-sm font-bold text-slate-700 dark:text-neutral-300 mb-2">
                                Display Name
                            </label>
                            <div className="flex gap-3">
                                <input
                                    id="name"
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="flex-1 px-4 py-3 bg-white dark:bg-neutral-800 border-2 border-black dark:border-neutral-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent font-medium"
                                    placeholder="Your name"
                                />
	                                <button
	                                    onClick={handleUpdateName}
	                                    disabled={mustResetPassword || loading || !name.trim() || name === authUser?.name}
	                                    className="px-6 py-3 bg-accent text-white font-bold rounded-xl border-2 border-black dark:border-neutral-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:disabled:hover:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] flex items-center gap-2"
	                                >
	                                    <Save size={18} />
	                                    Save
	                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-white dark:bg-neutral-900 border-2 border-black dark:border-neutral-700 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] p-6">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-rose-50 dark:bg-neutral-800 rounded-xl flex items-center justify-center border-2 border-rose-100 dark:border-neutral-700">
                                <Lock size={24} className="text-rose-600 dark:text-rose-400" />
                            </div>
                            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Change Password</h2>
                        </div>
                        {!showPasswordForm && !mustResetPassword && (
                            <button
                                onClick={() => setShowPasswordForm(true)}
                                className="px-4 py-2 bg-rose-600 dark:bg-rose-500 text-white font-bold rounded-xl border-2 border-black dark:border-neutral-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-0.5 transition-all duration-200"
                            >
                                Change Password
                            </button>
                        )}
                    </div>

                    {showPasswordForm && (
                        <div className="space-y-4">
                            <div>
                                <label htmlFor="currentPassword" className="block text-sm font-bold text-slate-700 dark:text-neutral-300 mb-2">
                                    Current Password
                                </label>
                                <input
                                    id="currentPassword"
                                    type="password"
                                    value={currentPassword}
                                    onChange={(e) => setCurrentPassword(e.target.value)}
                                    className="w-full px-4 py-3 bg-white dark:bg-neutral-800 border-2 border-black dark:border-neutral-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500 dark:focus:ring-rose-400 font-medium"
                                    placeholder="Enter current password"
                                />
                            </div>

                            <div>
                                <label htmlFor="newPassword" className="block text-sm font-bold text-slate-700 dark:text-neutral-300 mb-2">
                                    New Password
                                </label>
                                <input
                                    id="newPassword"
                                    type="password"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    minLength={passwordPolicy.minLength}
                                    maxLength={passwordPolicy.maxLength}
                                    pattern={passwordPolicy.patternHtml}
                                    className="w-full px-4 py-3 bg-white dark:bg-neutral-800 border-2 border-black dark:border-neutral-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500 dark:focus:ring-rose-400 font-medium"
                                    placeholder="Enter new password"
                                />
                                <PasswordRequirements
                                    password={newPassword}
                                    policy={passwordPolicy}
                                    className="text-slate-600 dark:text-neutral-400"
                                />
                            </div>

                            <div>
                                <label htmlFor="confirmPassword" className="block text-sm font-bold text-slate-700 dark:text-neutral-300 mb-2">
                                    Confirm New Password
                                </label>
                                <input
                                    id="confirmPassword"
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    minLength={passwordPolicy.minLength}
                                    maxLength={passwordPolicy.maxLength}
                                    className="w-full px-4 py-3 bg-white dark:bg-neutral-800 border-2 border-black dark:border-neutral-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500 dark:focus:ring-rose-400 font-medium"
                                    placeholder="Confirm new password"
                                />
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button
                                    onClick={handleChangePassword}
                                    disabled={loading || !currentPassword || !newPassword || !confirmPassword}
                                    className="flex-1 px-6 py-3 bg-rose-600 dark:bg-rose-500 text-white font-bold rounded-xl border-2 border-black dark:border-neutral-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:disabled:hover:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)]"
                                >
                                    {loading ? 'Changing...' : 'Change Password'}
                                </button>
                                    {!mustResetPassword && (
	                                    <button
	                                        onClick={() => {
	                                            setShowPasswordForm(false);
	                                            setCurrentPassword('');
	                                            setNewPassword('');
	                                            setConfirmPassword('');
	                                            setError('');
	                                        }}
	                                        disabled={loading}
	                                        className="px-6 py-3 bg-white dark:bg-neutral-800 text-slate-700 dark:text-neutral-300 font-bold rounded-xl border-2 border-black dark:border-neutral-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
	                                    >
	                                        <X size={18} />
	                                        Cancel
	                                    </button>
                                    )}
	                            </div>
	                        </div>
	                    )}
                </div>

                {/* API Keys */}
                <div className="bg-white dark:bg-neutral-900 border-2 border-black dark:border-neutral-700 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] p-6">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-12 h-12 bg-accent/10 dark:bg-neutral-800 rounded-xl flex items-center justify-center border-2 border-accent/15 dark:border-neutral-700">
                            <Key size={24} className="text-accent" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">API Keys</h2>
                            <p className="text-sm text-slate-500 dark:text-neutral-400">For the REST API and MCP server</p>
                        </div>
                    </div>

                    {/* Create new key */}
                    <div className="flex gap-2 mb-4">
                        <input
                            type="text"
                            value={apiKeyName}
                            onChange={(e) => setApiKeyName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleCreateApiKey()}
                            placeholder="Key name (e.g. claude-code)"
                            className="flex-1 px-4 py-3 bg-white dark:bg-neutral-800 border-2 border-black dark:border-neutral-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-accent font-medium"
                        />
                        <button
                            onClick={handleCreateApiKey}
                            disabled={apiKeyLoading || !apiKeyName.trim()}
                            className="px-6 py-3 bg-accent text-white font-bold rounded-xl border-2 border-black dark:border-neutral-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Create
                        </button>
                    </div>

                    {/* Newly created key banner */}
                    {newlyCreatedKey && (
                        <div className="mb-4 p-4 bg-green-50 dark:bg-green-900/20 border-2 border-green-200 dark:border-green-800 rounded-xl">
                            <p className="text-sm font-bold text-green-800 dark:text-green-200 mb-2">
                                Key created! Copy it now — it won't be shown again.
                            </p>
                            <div className="flex items-center gap-2">
                                <code className="flex-1 text-sm bg-white dark:bg-neutral-800 px-3 py-2 rounded-lg border border-green-200 dark:border-green-700 text-slate-800 dark:text-neutral-200 font-mono overflow-x-auto">
                                    {showNewKey ? newlyCreatedKey : '••••••••••••••••••••••••••'}
                                </code>
                                <button
                                    onClick={() => setShowNewKey(!showNewKey)}
                                    className="p-2 rounded-lg hover:bg-green-100 dark:hover:bg-green-800/30 text-green-700 dark:text-green-300"
                                    title={showNewKey ? 'Hide' : 'Show'}
                                >
                                    {showNewKey ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                                <button
                                    onClick={() => { navigator.clipboard.writeText(newlyCreatedKey); }}
                                    className="p-2 rounded-lg hover:bg-green-100 dark:hover:bg-green-800/30 text-green-700 dark:text-green-300"
                                    title="Copy to clipboard"
                                >
                                    <Copy size={18} />
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Key list */}
                    {apiKeys.length > 0 ? (
                        <div className="space-y-2">
                            {apiKeys.map((key) => (
                                <div key={key.id} className="flex items-center justify-between p-4 bg-slate-50 dark:bg-neutral-800 rounded-xl border-2 border-slate-200 dark:border-neutral-700">
                                    <div>
                                        <span className="font-bold text-slate-900 dark:text-white">{key.name}</span>
                                        <code className="ml-3 text-sm text-slate-500 dark:text-neutral-400 font-mono">{key.keyPreview}</code>
                                        <span className="ml-3 text-sm text-slate-400 dark:text-neutral-500">
                                            {new Date(key.createdAt).toLocaleDateString()}
                                        </span>
                                    </div>
                                    <button
                                        onClick={() => setApiKeyDeleteConfirm(key.id)}
                                        className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                                        title="Delete key"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-slate-400 dark:text-neutral-500">No API keys yet.</p>
                    )}
                </div>

                {/* AI Configuration */}
                <div className="bg-white dark:bg-neutral-900 border-2 border-black dark:border-neutral-700 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] p-6">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-12 h-12 bg-amber-50 dark:bg-neutral-800 rounded-xl flex items-center justify-center border-2 border-amber-100 dark:border-neutral-700">
                            <Sparkles size={24} className="text-amber-600 dark:text-amber-400" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">AI Configuration</h2>
                            <p className="text-sm text-slate-500 dark:text-neutral-400">
                                {aiConfigured ? 'AI is configured and ready to use' : 'Configure an AI provider to use AI features in the editor'}
                            </p>
                        </div>
                    </div>

                    {aiConfigured && (
                        <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/20 border-2 border-green-200 dark:border-green-800 rounded-xl flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-green-100 dark:bg-green-900/40 rounded-lg flex items-center justify-center">
                                    <Key size={16} className="text-green-600 dark:text-green-400" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-green-800 dark:text-green-200">API key saved</p>
                                    <p className="text-xs text-green-600 dark:text-green-400">
                                        {aiProvider === 'openai' ? 'OpenAI' : aiProvider} &middot; {aiModel}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="space-y-4">
                        <div>
                            <label htmlFor="aiProvider" className="block text-sm font-bold text-slate-700 dark:text-neutral-300 mb-2">
                                Provider
                            </label>
                            <select
                                id="aiProvider"
                                value={aiProvider}
                                onChange={(e) => setAiProvider(e.target.value)}
                                className="w-full px-4 py-3 bg-white dark:bg-neutral-800 border-2 border-black dark:border-neutral-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent font-medium"
                            >
                                <option value="openai">OpenAI</option>
                            </select>
                        </div>

                        <div>
                            <label htmlFor="aiApiKey" className="block text-sm font-bold text-slate-700 dark:text-neutral-300 mb-2">
                                API Key {aiConfigured && <span className="text-green-600 dark:text-green-400 font-normal">(saved — enter new key to update)</span>}
                            </label>
                            <div className="flex gap-2">
                                <input
                                    id="aiApiKey"
                                    type={showAiKey ? 'text' : 'password'}
                                    value={aiApiKey}
                                    onChange={(e) => setAiApiKey(e.target.value)}
                                    className="flex-1 px-4 py-3 bg-white dark:bg-neutral-800 border-2 border-black dark:border-neutral-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-accent font-medium font-mono"
                                    placeholder={aiConfigured ? '••••••••••••••••' : 'sk-...'}
                                />
                                <button
                                    onClick={() => setShowAiKey(!showAiKey)}
                                    className="p-3 rounded-xl border-2 border-black dark:border-neutral-700 hover:bg-slate-50 dark:hover:bg-neutral-800 text-slate-500 dark:text-neutral-400"
                                    title={showAiKey ? 'Hide' : 'Show'}
                                >
                                    {showAiKey ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>

                        <div>
                            <label htmlFor="aiModel" className="block text-sm font-bold text-slate-700 dark:text-neutral-300 mb-2">
                                Model
                            </label>
                            <select
                                id="aiModel"
                                value={aiModel}
                                onChange={(e) => setAiModel(e.target.value)}
                                className="w-full px-4 py-3 bg-white dark:bg-neutral-800 border-2 border-black dark:border-neutral-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent font-medium"
                            >
                                <option value="gpt-5.2">GPT-5.2</option>
                                <option value="gpt-5-mini">GPT-5 Mini</option>
                                <option value="gpt-5-nano">GPT-5 Nano</option>
                                <option value="gpt-4.1">GPT-4.1</option>
                            </select>
                        </div>

                        <div className="flex gap-3 pt-2">
                            <button
                                onClick={handleSaveAiSettings}
                                disabled={aiLoading || !aiApiKey.trim()}
                                className="flex-1 px-6 py-3 bg-accent text-white font-bold rounded-xl border-2 border-black dark:border-neutral-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {aiLoading ? 'Saving...' : 'Save AI Settings'}
                            </button>
                            {aiConfigured && (
                                <button
                                    onClick={handleDeleteAiSettings}
                                    disabled={aiLoading}
                                    className="px-6 py-3 bg-white dark:bg-neutral-800 text-red-600 dark:text-red-400 font-bold rounded-xl border-2 border-red-300 dark:border-red-800 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                >
                                    <Trash2 size={18} />
                                    Remove
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* MCP Server Setup */}
                <div className="bg-white dark:bg-neutral-900 border-2 border-black dark:border-neutral-700 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] p-6">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-12 h-12 bg-violet-50 dark:bg-neutral-800 rounded-xl flex items-center justify-center border-2 border-violet-100 dark:border-neutral-700">
                            <Terminal size={24} className="text-violet-600 dark:text-violet-400" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">MCP Server</h2>
                            <p className="text-sm text-slate-500 dark:text-neutral-400">Use AI assistants to create and edit diagrams</p>
                        </div>
                    </div>

                    <p className="text-sm text-slate-600 dark:text-neutral-400 mb-4">
                        Add this to your Claude Code or Claude Desktop MCP configuration. Replace <code className="px-1.5 py-0.5 bg-slate-100 dark:bg-neutral-800 rounded text-xs font-mono">your-api-key</code> with a key from the section above.
                    </p>

                    <div className="relative">
                        <pre className="p-4 bg-slate-50 dark:bg-neutral-800 border-2 border-slate-200 dark:border-neutral-700 rounded-xl text-sm font-mono text-slate-800 dark:text-neutral-200 overflow-x-auto whitespace-pre">{`{
  "mcpServers": {
    "mermaiddash": {
      "command": "npx",
      "args": ["-y", "mermaiddash-mcp"],
      "env": {
        "MERMAIDDASH_URL": "${window.location.origin}",
        "MERMAIDDASH_API_KEY": "your-api-key"
      }
    }
  }
}`}</pre>
                        <button
                            onClick={() => {
                                const config = JSON.stringify({
                                    mcpServers: {
                                        mermaiddash: {
                                            command: "npx",
                                            args: ["-y", "mermaiddash-mcp"],
                                            env: {
                                                MERMAIDDASH_URL: window.location.origin,
                                                MERMAIDDASH_API_KEY: "your-api-key"
                                            }
                                        }
                                    }
                                }, null, 2);
                                navigator.clipboard.writeText(config);
                            }}
                            className="absolute top-3 right-3 p-2 rounded-lg bg-white dark:bg-neutral-700 border border-slate-200 dark:border-neutral-600 hover:bg-slate-100 dark:hover:bg-neutral-600 text-slate-500 dark:text-neutral-400 transition-colors"
                            title="Copy to clipboard"
                        >
                            <Copy size={16} />
                        </button>
                    </div>

                    {/* Setup prompt */}
                    <div className="mt-4">
                        <p className="text-sm font-bold text-slate-700 dark:text-neutral-300 mb-2">Quick setup prompt:</p>
                        <p className="text-xs text-slate-500 dark:text-neutral-400 mb-2">Copy this and paste it into Claude Code to set up the MCP server automatically.</p>
                        <div className="relative">
                            <pre className="p-4 bg-violet-50 dark:bg-violet-900/20 border-2 border-violet-200 dark:border-violet-800 rounded-xl text-sm font-mono text-slate-800 dark:text-neutral-200 overflow-x-auto whitespace-pre-wrap">{`Set up the MermaidDash MCP server. Add this config to my Claude Code MCP settings (usually ~/.claude/settings.json under "mcpServers"):

Server name: mermaiddash
Command: npx -y mermaiddash-mcp
Environment variables:
  MERMAIDDASH_URL=${window.location.origin}
  MERMAIDDASH_API_KEY=${newlyCreatedKey || '<paste your API key here>'}

After adding, verify the MCP tools are available: create_diagram, update_diagram, get_diagram, list_diagrams, delete_diagram, list_collections, create_collection, delete_collection, move_diagram.`}</pre>
                            <button
                                onClick={() => {
                                    const prompt = `Set up the MermaidDash MCP server. Add this config to my Claude Code MCP settings (usually ~/.claude/settings.json under "mcpServers"):\n\nServer name: mermaiddash\nCommand: npx -y mermaiddash-mcp\nEnvironment variables:\n  MERMAIDDASH_URL=${window.location.origin}\n  MERMAIDDASH_API_KEY=${newlyCreatedKey || '<paste your API key here>'}\n\nAfter adding, verify the MCP tools are available: create_diagram, update_diagram, get_diagram, list_diagrams, delete_diagram, list_collections, create_collection, delete_collection, move_diagram.`;
                                    navigator.clipboard.writeText(prompt);
                                }}
                                className="absolute top-3 right-3 p-2 rounded-lg bg-white dark:bg-neutral-700 border border-violet-200 dark:border-violet-700 hover:bg-violet-100 dark:hover:bg-violet-800/30 text-violet-500 dark:text-violet-400 transition-colors"
                                title="Copy prompt to clipboard"
                            >
                                <Copy size={16} />
                            </button>
                        </div>
                    </div>

                    <div className="mt-4 text-sm text-slate-500 dark:text-neutral-400">
                        <p className="font-bold text-slate-700 dark:text-neutral-300 mb-2">Available tools:</p>
                        <ul className="space-y-1 ml-4 list-disc">
                            <li><code className="text-xs font-mono">create_diagram</code> — Create a new diagram</li>
                            <li><code className="text-xs font-mono">update_diagram</code> — Update diagram content</li>
                            <li><code className="text-xs font-mono">get_diagram</code> — Get diagram source</li>
                            <li><code className="text-xs font-mono">list_diagrams</code> — List all diagrams</li>
                            <li><code className="text-xs font-mono">delete_diagram</code> — Delete a diagram</li>
                            <li><code className="text-xs font-mono">list_collections</code> — List all collections</li>
                            <li><code className="text-xs font-mono">create_collection</code> — Create a new collection</li>
                            <li><code className="text-xs font-mono">delete_collection</code> — Delete a collection</li>
                            <li><code className="text-xs font-mono">move_diagram</code> — Move a diagram to a collection</li>
                        </ul>
                    </div>
                </div>
            </div>

            <ConfirmModal
                isOpen={apiKeyDeleteConfirm !== null}
                title="Delete API Key"
                message="Any integrations using this key will stop working immediately."
                confirmText="Delete"
                isDangerous
                onConfirm={() => apiKeyDeleteConfirm && handleDeleteApiKey(apiKeyDeleteConfirm)}
                onCancel={() => setApiKeyDeleteConfirm(null)}
            />
        </Layout>
    );
};
