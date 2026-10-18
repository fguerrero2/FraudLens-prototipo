import * as SecureStore from 'expo-secure-store'
import { t as translate, getLocale, languages, setLocale, subscribe } from './shared/i18n'
import React, { useEffect, useState, useSyncExternalStore } from 'react'
import { ActivityIndicator, Alert, FlatList, Image, Modal, Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, useColorScheme, View } from 'react-native'
import { useFonts } from 'expo-font'
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular'
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold'
import { IBMPlexMono_400Regular } from '@expo-google-fonts/ibm-plex-mono/400Regular'
import { request, restoreSession, saveSession } from './api'

// Palette from FraudLens/docs/05-producto/identidad/paleta.md, same tokens as Frontend/src/styles.css.
const palette = {
  light: { bg:'#FAFAFA', surface:'#FFFFFF', text:'#18181B', muted:'#52525B', border:'#E4E4E7', control:'#71717A', brand:'#9333EA', brandSoft:'#F3E8FF', fill:'#9333EA', onFill:'#FFFFFF', low:'#15803D', medium:'#B45309', high:'#C2410C', critical:'#B91C1C', lowBg:'#F0FDF4', mediumBg:'#FFFBEB', highBg:'#FFF7ED', criticalBg:'#FEF2F2' },
  dark: { bg:'#0D0D10', surface:'#16161A', text:'#F4F4F5', muted:'#A1A1AA', border:'#303036', control:'#71717A', brand:'#A855F7', brandSoft:'#251630', fill:'#9333EA', onFill:'#FFFFFF', low:'#22C55E', medium:'#FBBF24', high:'#F97316', critical:'#F87171', lowBg:'#14251A', mediumBg:'#2B2413', highBg:'#2E1D13', criticalBg:'#2E171B' },
}
const logos = { light: require('./assets/logo-completo-modo-claro.png'), dark: require('./assets/logo-completo-modo-oscuro.png') }
// Risk and decision always pair color with a shape and a label, never color alone.
const levels = { bajo:['low','✓','Low'], medio:['medium','⚠','Medium'], alto:['high','◆','High'], critico:['critical','●','Critical'] }
const decisionTone = { aprobar:['low','✓','Approve'], revisar:['medium','⚠','Review'], bloquear:['critical','⊘','Block'] }
const decisions = Object.fromEntries(Object.entries(decisionTone).map(([key, [, shape, label]]) => [key, `${shape} ${label}`]))
const outcomes = { fraud: 'Confirmed fraud', legitimate: 'Legitimate', pending: 'Pending' }
export default function App() {
  const locale = useSyncExternalStore(subscribe, getLocale)
  const [languageReady, setLanguageReady] = useState(false)
  const [languageMenu, setLanguageMenu] = useState(false)
  const [loginHelp, setLoginHelp] = useState(false)
  useEffect(() => { let active = true; SecureStore.getItemAsync('fraudlens-language').then(value => { if (active) setLocale(value) }).catch(() => {}).finally(() => { if (active) setLanguageReady(true) }); return () => { active = false } }, [])
  async function changeLanguage(tag) { setLocale(tag); setLanguageMenu(false); try { await SecureStore.setItemAsync('fraudlens-language', tag) } catch { /* Retain the current in-memory language. */ } }
  const systemTheme = useColorScheme()
  const [theme, setTheme] = useState(null)
  const dark = (theme || systemTheme) === 'dark'
  const colors = palette[dark ? 'dark' : 'light']
  const [fontsLoaded, fontError] = useFonts({ Inter_400Regular, Inter_600SemiBold, IBMPlexMono_400Regular })
  const [profile, setProfile] = useState(null), [email, setEmail] = useState(''), [password, setPassword] = useState('')
  const [transactions, setTransactions] = useState([]), [metrics, setMetrics] = useState(null), [detail, setDetail] = useState(null), [alerts, setAlerts] = useState([])
  const [error, setError] = useState(''), [success, setSuccess] = useState(''), [busy, setBusy] = useState(true), [page, setPage] = useState(1), [totalPages, setTotalPages] = useState(1)
  const [comment, setComment] = useState(''), [outcome, setOutcome] = useState('pending'), [tab, setTab] = useState('Summary'), [selector, setSelector] = useState(false)
  useEffect(() => {
    if (!detail) return
    setOutcome(detail.review?.outcome || 'pending')
    setComment('')
  }, [detail])
  const organization = profile?.tenants.find(t => t.id === profile.tenant_id)
  const can = p => profile?.permissions.includes(p)
  const s = styles(colors, fontsLoaded)
  function Copy({ children, mono, muted, style, ...props }) { return <Text {...props} style={[s.text, mono && s.mono, muted && {color:colors.muted}, style]}>{children}</Text> }
  // Every button shares height, radius, border width and type size; variants only change color.
  function Button({ title, onPress, variant = 'secondary', disabled = busy, selected, role = 'button', style }) {
    const tone = { primary:[colors.fill, colors.fill, colors.onFill], danger:[colors.surface, colors.critical, colors.critical], tab:['transparent', 'transparent', colors.muted], secondary:[colors.surface, colors.control, colors.text] }[variant]
    const [bg, border, ink] = selected ? [colors.brandSoft, colors.brand, colors.brand] : tone
    return <Pressable accessibilityRole={role} accessibilityLabel={translate(title)} accessibilityState={{ disabled, selected:!!selected, checked: role === 'radio' ? !!selected : undefined }} disabled={disabled} onPress={onPress} style={({pressed}) => [s.button, variant === 'tab' && s.tab, {backgroundColor:bg, borderColor:border, opacity:disabled ? .5 : pressed ? .75 : 1}, style]}><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={.8} style={[s.buttonText, variant === 'tab' && s.tabText, {color:ink}]}>{translate(title)}</Text></Pressable>
  }
  // Buttons placed side by side always split the row in equal parts.
  function Row({ children }) { return <View style={s.row}>{React.Children.toArray(children).filter(Boolean).map((child, i) => <View key={i} style={{flex:1}}>{child}</View>)}</View> }
  function PreferenceSwitch({ label, checked, states, onPress, accessibilityLabel }) {
    return <View style={s.preference}><Copy muted style={s.small}>{label}</Copy><Pressable accessibilityRole="switch" accessibilityState={{checked}} accessibilityLabel={accessibilityLabel || label} onPress={onPress} style={s.switchTrack}><View pointerEvents="none" style={[s.switchThumb, checked && {left:40}]}/>{states.map((state, index) => <Text key={index} style={[s.switchState, {color:checked === (index === 1) ? colors.onFill : colors.muted}]}>{state}</Text>)}</Pressable></View>
  }
  function Badge({ tone: [tone, shape, label] }) { return <View style={[s.badge, {backgroundColor:colors[`${tone}Bg`]}]}><Text style={[s.badgeText, {color:colors[tone]}]}>{shape} {translate(label)}</Text></View> }
  const riskBadge = t => t.risk_score === null || t.risk_score === undefined ? <Copy muted>{translate("Not evaluated")}</Copy> : <View style={s.badges}><Copy mono style={{fontSize:16, color:colors[levels[t.risk_level]?.[0]] || colors.text}}>{t.risk_score}</Copy>{levels[t.risk_level] && <Badge tone={levels[t.risk_level]}/>}</View>
  function guard(action) {
    const savedOutcome = detail?.review?.outcome || 'pending'
    if (comment.trim() || outcome !== savedOutcome) Alert.alert(translate("Discard unsaved review?"), translate("Your selected result or evidence has not been saved."), [{text:translate("Keep editing"),style:'cancel'},{text:translate("Discard"),style:'destructive',onPress:() => {setComment(''); setOutcome(savedOutcome); action()}}])
    else action()
  }
  useEffect(() => { (async () => { try { if (await restoreSession()) setProfile(await request('/auth/me')) } catch { await saveSession(null); setError("Session expired. Sign in again.") } finally { setBusy(false) } })() }, [])
  async function run(action) { setBusy(true); setError(''); setSuccess(''); try { await action() } catch (err) { setError(err.message); if (err.status === 401) { await saveSession(null); setProfile(null) } } finally { setBusy(false) } }
  function login() { if (!email.trim() || !password) { setError("Enter your email and password."); return } run(async () => { const next = await request('/auth/login','POST',{email:email.trim(),password}); await saveSession(next); setProfile(next); setPassword('') }) }
  function logout() { guard(() => run(async () => { try { await request('/auth/logout','POST',{}) } finally { await saveSession(null); setProfile(null); setDetail(null); setTransactions([]); setMetrics(null); setAlerts([]) } })) }
  function selectTenant(id) { guard(() => run(async () => { const next = await request('/auth/tenant','POST',{tenant_id:id}); setDetail(null); setComment(''); setTransactions([]); setMetrics(null); setAlerts([]); setPage(1); setProfile(next); setSelector(false); setTab('Summary') })) }
  async function load(nextPage = page) {
    await run(async () => {
      const [list, nextMetrics, nextAlerts] = await Promise.all([can('transactions.read') ? request(`/transactions?page=${nextPage}&page_size=20`) : Promise.resolve({data:[],pagination:{total_pages:1}}), can('dashboard.read') ? request('/dashboard/metrics') : Promise.resolve(null), can('alerts.read') ? request('/alerts') : Promise.resolve([])])
      setTransactions(list.data); setPage(nextPage); setTotalPages(Math.max(1,list.pagination.total_pages)); setMetrics(nextMetrics); setAlerts(nextAlerts); setSuccess("Data updated.")
    })
  }
  useEffect(() => { if (profile?.tenant_id) load(1) }, [profile?.tenant_id])
  function review() {
    if (comment.trim().length < 3) { setError("Evidence must contain at least 3 characters."); return }
    run(async () => { setDetail(await request(`/transactions/${encodeURIComponent(detail.transaction_id)}/review`,'PUT',{outcome,analyst:profile.user.name,comment:comment.trim()})); setComment(''); setSuccess("Review recorded. Automatic recommendation is unchanged.") })
  }
  const tabs = ['Summary', ...(can('transactions.read') ? ['Transactions'] : []), ...(can('alerts.read') ? ['Alerts'] : []), 'Help']
  if (!languageReady || (!fontsLoaded && !fontError)) return <SafeAreaView style={[s.root, s.center]}><ActivityIndicator color={colors.brand}/></SafeAreaView>
  const viewTransaction = t => run(async () => {setDetail(await request(`/transactions/${encodeURIComponent(t.transaction_id)}`));setComment('');setOutcome('pending')})
  return <SafeAreaView style={s.root}><StatusBar barStyle={dark ? 'light-content':'dark-content'} backgroundColor={colors.bg}/>
    <View style={s.header}><Image source={logos[dark ? 'dark' : 'light']} style={s.logo} resizeMode="contain" accessibilityLabel="FraudLens"/><View style={s.preferences}><View style={s.languageSelect}><Copy muted style={s.small}>{translate('Language')}</Copy><Pressable accessibilityRole="combobox" accessibilityLabel={translate('Change language')} accessibilityValue={{text:languages.find(language => language.tag === locale)?.label}} accessibilityState={{expanded:languageMenu}} onPress={() => setLanguageMenu(true)} style={s.languageControl}><Copy style={s.small}>{languages.find(language => language.tag === locale)?.label} ▾</Copy></Pressable></View><PreferenceSwitch label={translate(dark ? 'Dark mode' : 'Light mode')} checked={dark} states={['☀','☾']} accessibilityLabel={translate('Dark mode')} onPress={() => setTheme(dark ? 'light':'dark')}/></View></View>
    {profile && <View style={s.organization}><Copy muted style={s.small}>{translate("Active organization")}</Copy><Copy style={s.heading}>{organization?.name || translate("No organization selected")}</Copy><Row><Button title={translate("Change organization")} onPress={() => guard(() => setSelector(true))}/><Button title={translate("Sign out")} onPress={logout}/></Row></View>}
    {busy && <View accessibilityLiveRegion="polite" style={s.notice}><ActivityIndicator color={colors.brand}/><Copy muted>{translate("Processing…")}</Copy></View>}
    {error ? <View accessibilityLiveRegion="assertive" style={[s.message, {backgroundColor:colors.criticalBg, borderColor:colors.critical}]}><Copy accessibilityRole="alert" style={{color:colors.critical}}>{translate(error)}</Copy>{profile && !detail && <Button title={translate("Retry loading")} variant="danger" onPress={() => load(page)}/>}</View> : null}
    {success ? <View accessibilityLiveRegion="polite" style={[s.message, {backgroundColor:colors.lowBg, borderColor:colors.low}]}><Copy style={{color:colors.low}}>✓ {translate(success)}</Copy></View> : null}
    <Modal visible={languageMenu} transparent animationType="fade" onRequestClose={() => setLanguageMenu(false)}><View style={s.languageOverlay}><View style={s.languageDialog} accessibilityViewIsModal><Copy style={s.heading}>{translate('Language')}</Copy><View accessibilityRole="radiogroup">{languages.map(language => <View key={language.tag} style={{marginTop:8}}><Button title={`${language.tag === locale ? '✓ ' : ''}${language.label}`} role="radio" selected={language.tag === locale} disabled={false} onPress={() => changeLanguage(language.tag)}/></View>)}</View><Button title={translate('Cancel')} disabled={false} onPress={() => setLanguageMenu(false)}/></View></View></Modal>
    <Modal visible={loginHelp} animationType="slide" onRequestClose={() => setLoginHelp(false)}><SafeAreaView style={s.root}><ScrollView contentContainerStyle={s.form}><Copy style={s.title}>{translate("Using FraudLens")}</Copy><View style={s.card}><Copy>{translate("Check the active organization before reviewing a transaction. Each organization has its own data and permissions.")}</Copy><Copy>{translate("Automatic recommendations and human reviews are recorded separately. Open a transaction, select a review result and record your evidence.")}</Copy><Copy>{translate("The risk score is an indicator, not a probability of fraud. Risk levels show a symbol as well as a color: ✓ Low · ⚠ Medium · ◆ High · ● Critical.")}</Copy><Copy>{translate("To correct a review, record a new one. Previous reviews remain in the history.")}</Copy><Copy>{translate("If loading fails, use Retry loading. Your draft remains available after a failed save. Contact your administrator for access changes.")}</Copy></View><Button title={translate('Close')} disabled={false} onPress={() => setLoginHelp(false)}/></ScrollView></SafeAreaView></Modal>
    {!profile ? <ScrollView contentContainerStyle={s.form} keyboardShouldPersistTaps="handled"><Copy style={s.title}>{translate("Sign in")}</Copy><Copy muted>{translate("Use the account of your organization.")}</Copy><Copy style={s.label}>{translate("Email")}</Copy><TextInput accessibilityLabel={translate("Email")} style={s.input} value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" placeholderTextColor={colors.muted}/><Copy style={s.label}>{translate("Password")}</Copy><TextInput accessibilityLabel={translate("Password")} style={s.input} value={password} onChangeText={setPassword} secureTextEntry autoComplete="password"/><Button title={busy ? translate("Signing in…"):translate("Sign in")} variant="primary" onPress={login}/></ScrollView> : <>
      <Modal visible={selector} animationType="slide" onRequestClose={() => setSelector(false)}><SafeAreaView style={s.root}><ScrollView contentContainerStyle={s.form}><Copy style={s.title}>{translate("Choose organization")}</Copy><Copy muted>{translate("Each organization has its own data and permissions.")}</Copy>{profile.tenants.map(t => <Button key={t.id} role="radio" title={`${t.id === profile.tenant_id ? '✓ ':''}${t.name}`} selected={t.id === profile.tenant_id} onPress={() => selectTenant(t.id)}/>)}<Button title={translate("Cancel")} disabled={false} onPress={() => setSelector(false)}/></ScrollView></SafeAreaView></Modal>
      {detail ? <ScrollView contentContainerStyle={s.form} keyboardShouldPersistTaps="handled"><Button title={translate("‹ Back to transactions")} onPress={() => guard(() => setDetail(null))}/><View style={s.card}><Copy mono style={s.heading}>{detail.transaction_id}</Copy><Copy>{detail.received_data.amount} {detail.received_data.currency} · {detail.received_data.merchant}</Copy><Copy muted style={s.label}>{translate("Automatic recommendation")}</Copy><View style={s.badges}>{decisionTone[detail.decision] ? <Badge tone={decisionTone[detail.decision]}/> : <Copy>{detail.decision}</Copy>}{riskBadge(detail)}</View><Copy muted style={s.small}>{translate("The risk score (0–100) is an indicator, not a probability of fraud.")}</Copy>{detail.reasons.map((reason,i) => <Copy key={i}>• {translate(reason)}</Copy>)}</View>{can('transactions.review') && <View style={s.card}><Copy style={s.heading}>{translate("Human review")}</Copy><Copy>{translate("Current result:")} {translate(outcomes[detail.review?.outcome] || "Pending")}</Copy><Copy style={s.label}>{translate("Select a result")}</Copy>{Object.entries(outcomes).map(([value,label]) => <Button key={value} role="radio" title={translate(label)} selected={outcome === value} onPress={() => setOutcome(value)}/>)}<Copy style={s.label}>{translate("Evidence / comment (required)")}</Copy><TextInput accessibilityLabel={translate("Evidence / comment")} style={[s.input,{minHeight:100,textAlignVertical:'top'}]} value={comment} onChangeText={setComment} multiline maxLength={2000}/><Button title={busy ? translate("Saving…"):translate("Record review")} variant="primary" onPress={review}/></View>}{can('transactions.review') && <><Copy style={s.heading}>{translate("Review history")}</Copy>{!detail.review_history?.length && <Copy muted>{translate("No reviews yet.")}</Copy>}{detail.review_history?.map(r => <View key={r.id} style={s.card}><Copy>{translate(outcomes[r.outcome])} · {r.analyst}</Copy><Copy muted style={s.small}>{new Date(r.createdAt).toLocaleString(getLocale())}</Copy><Copy>{r.comment}</Copy></View>)}</>}</ScrollView> : tab === 'Transactions' ? <><View style={s.toolbar}><Button title={translate("Refresh transactions")} onPress={() => load(page)}/></View><FlatList data={transactions} contentContainerStyle={s.list} keyExtractor={t => t.transaction_id} renderItem={({item:t}) => <View style={s.card}><Copy mono>{t.transaction_id}</Copy><Copy>{t.amount} {t.currency}</Copy><View style={s.badges}>{riskBadge(t)}{decisionTone[t.decision] && <Badge tone={decisionTone[t.decision]}/>}</View><Button title={translate("View transaction")} onPress={() => viewTransaction(t)}/></View>} ListEmptyComponent={!busy && !error ? <Copy muted style={s.form}>{translate("No transactions in this organization yet.")}</Copy> : null}/><View style={s.pagination}><View style={{flex:1}}><Button title={translate("‹ Previous")} disabled={busy || page<=1} onPress={() => load(page-1)}/></View><Copy style={s.pageText}>{page} / {totalPages}</Copy><View style={{flex:1}}><Button title={translate("Next ›")} disabled={busy || page>=totalPages} onPress={() => load(page+1)}/></View></View></> : <ScrollView contentContainerStyle={s.form}>
        {tab === 'Summary' && <><Copy style={s.title}>{translate("Summary")}</Copy>{metrics ? <View style={s.metrics}>{[['Transactions today', metrics.transactions_today], ['High & critical', metrics.high_critical_count], ['Blocked', metrics.blocked_count], ['Average risk', metrics.avg_risk_score ?? '—']].map(([label, value]) => <View key={label} style={s.metric}><Copy muted style={s.small}>{translate(label)}</Copy><Copy style={s.metricValue}>{value ?? '—'}</Copy></View>)}</View> : <Copy muted>{translate("No summary available for your role.")}</Copy>}<Button title={translate("Refresh summary")} onPress={() => load(page)}/></>}
        {tab === 'Alerts' && <><Copy style={s.title}>{translate("Alerts")}</Copy>{!alerts.length && !busy && !error && <Copy muted>{translate("No alerts in this organization.")}</Copy>}{alerts.map(a => <View key={a.id} style={s.card}><Copy mono>{a.transaction.externalId}</Copy><Copy>{translate(a.severity)} · {translate(a.status)}</Copy>{can('alerts.update') && a.status !== 'resolved' && <Button title={translate("Resolve alert")} onPress={() => Alert.alert(translate("Resolve alert?"), translate("Mark the alert for {0} as resolved?", [a.transaction.externalId]),[{text:translate("Cancel"),style:'cancel'},{text:translate("Resolve"),onPress:() => run(async () => {await request(`/alerts/${a.id}`,'PUT',{status:'resolved'});setAlerts(items => items.map(item => item.id === a.id ? {...item,status:'resolved'} : item));setSuccess("Alert resolved.")})}])}/>}</View>)}</>}
        {tab === 'Help' && <><Copy style={s.title}>{translate("Using FraudLens")}</Copy><View style={s.card}><Copy>{translate("Check the active organization before reviewing a transaction. Each organization has its own data and permissions.")}</Copy><Copy>{translate("Automatic recommendations and human reviews are recorded separately. Open a transaction, select a review result and record your evidence.")}</Copy><Copy>{translate("The risk score is an indicator, not a probability of fraud. Risk levels show a symbol as well as a color: ✓ Low · ⚠ Medium · ◆ High · ● Critical.")}</Copy><Copy>{translate("To correct a review, record a new one. Previous reviews remain in the history.")}</Copy><Copy>{translate("If loading fails, use Retry loading. Your draft remains available after a failed save. Contact your administrator for access changes.")}</Copy></View></>}
      </ScrollView>}
      <View style={s.tabs} accessibilityRole="tablist">{tabs.map(name => <View key={name} style={{flex:1}}><Button title={translate(name)} variant="tab" role="tab" selected={!detail && tab === name} onPress={() => guard(() => {setDetail(null);setTab(name)})}/></View>)}</View>
    </>}
    {!profile && <View style={s.loginHelp}><Button title={translate('Help')} disabled={false} onPress={() => setLoginHelp(true)}/></View>}
  </SafeAreaView>
}
const styles = (c, fonts) => {
  const regular = fonts ? 'Inter_400Regular' : undefined, semibold = fonts ? 'Inter_600SemiBold' : undefined
  return StyleSheet.create({
    root:{flex:1,backgroundColor:c.bg,paddingTop:StatusBar.currentHeight || 0}, center:{justifyContent:'center',alignItems:'center'},
    text:{color:c.text,fontSize:16,fontFamily:regular,lineHeight:24}, mono:{fontFamily:fonts?'IBMPlexMono_400Regular':'monospace'}, small:{fontSize:14,lineHeight:20},
    title:{fontSize:24,lineHeight:32,fontFamily:semibold,fontWeight:fonts?undefined:'600'}, heading:{fontSize:20,lineHeight:28,fontFamily:semibold,fontWeight:fonts?undefined:'600'}, label:{fontSize:14,fontFamily:semibold,fontWeight:fonts?undefined:'600'},
    header:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:12,paddingHorizontal:16,paddingVertical:8,backgroundColor:c.surface,borderBottomWidth:1,borderColor:c.border}, logo:{width:120,height:30},
    preferences:{flex:1,flexBasis:'100%',flexDirection:'row',alignItems:'center',justifyContent:'flex-end',gap:12}, preference:{alignItems:'center',gap:4},
    languageSelect:{flex:1,alignItems:'flex-end',gap:4}, languageControl:{width:'100%',minHeight:44,paddingVertical:8,borderWidth:1,borderColor:c.control,borderRadius:8,paddingHorizontal:12,justifyContent:'center',backgroundColor:c.surface},
    languageOverlay:{flex:1,justifyContent:'center',padding:24,backgroundColor:c.bg}, languageDialog:{padding:20,borderWidth:1,borderColor:c.border,borderRadius:12,backgroundColor:c.surface,gap:16},
    switchTrack:{width:76,height:44,borderRadius:22,borderWidth:1,borderColor:c.control,backgroundColor:c.surface,flexDirection:'row',padding:4,alignItems:'center'},
    switchThumb:{position:'absolute',left:4,top:4,bottom:4,width:30,borderRadius:18,backgroundColor:c.fill},
    switchState:{flex:1,textAlign:'center',fontSize:14,fontWeight:'600'}, loginHelp:{padding:16,alignItems:'flex-end'},
    row:{flexDirection:'row',gap:8},
    organization:{padding:16,marginHorizontal:16,marginTop:12,borderLeftWidth:4,borderLeftColor:c.brand,backgroundColor:c.surface,borderRadius:12,borderWidth:1,borderColor:c.border,gap:8},
    form:{padding:16,gap:12}, list:{paddingHorizontal:16,gap:12,paddingBottom:12}, toolbar:{paddingHorizontal:16,paddingTop:12,paddingBottom:12},
    input:{backgroundColor:c.surface,color:c.text,fontFamily:regular,fontSize:16,borderColor:c.control,borderWidth:1,borderRadius:8,paddingHorizontal:12,paddingVertical:10,minHeight:48},
    button:{minHeight:48,paddingHorizontal:16,borderRadius:8,borderWidth:1,justifyContent:'center',alignItems:'center'}, buttonText:{fontSize:16,fontFamily:semibold,fontWeight:fonts?undefined:'600'},
    tab:{paddingHorizontal:4,borderRadius:8}, tabText:{fontSize:13},
    notice:{paddingHorizontal:16,paddingTop:12,flexDirection:'row',alignItems:'center',gap:8},
    message:{marginHorizontal:16,marginTop:12,padding:12,borderRadius:8,borderWidth:1,gap:8},
    card:{padding:16,backgroundColor:c.surface,borderRadius:12,borderWidth:1,borderColor:c.border,gap:10},
    badges:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:8}, badge:{paddingHorizontal:8,paddingVertical:3,borderRadius:4}, badgeText:{fontSize:13,fontFamily:semibold,fontWeight:fonts?undefined:'600'},
    metrics:{flexDirection:'row',flexWrap:'wrap',gap:12}, metric:{flexBasis:'47%',flexGrow:1,padding:16,backgroundColor:c.surface,borderRadius:12,borderWidth:1,borderColor:c.border}, metricValue:{fontSize:28,lineHeight:36,fontFamily:semibold,fontWeight:fonts?undefined:'600'},
    pagination:{flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:16,paddingVertical:8}, pageText:{width:72,textAlign:'center'},
    tabs:{flexDirection:'row',gap:4,padding:8,backgroundColor:c.surface,borderTopWidth:1,borderColor:c.border},
  })
}
