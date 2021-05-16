const subscriber = (optionChange) => {
  // the moment the language is changed, the entire <music-app> becomes stale and must be rerendered
  if (optionChange.option === 'lang') {
    console.log('Rerendering <music-app> to change language')

    // set the new lang, the app will read this value on rerender
    Router.setLang(optionChange.newValue)

    document.querySelector('#app').render()
  }
}

/**
 * Rerender the <music-app> element when the language switches.
 */
export function subscribe() {
  Bridge.ipcListen('option-change', subscriber)
}

export function unsubscribe() {
  Bridge.removeListener('option-change', subscriber)
}