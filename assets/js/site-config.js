(() => {
    const socialLinks = Object.freeze({
        instagram: 'https://www.instagram.com/skinfit_aesthetics_clinic/',
        facebook: 'https://www.facebook.com/profile.php?id=61591991960112#'
    })

    document.querySelectorAll('[data-social-link]').forEach(link => {
        const platform = link.dataset.socialLink
        const url = socialLinks[platform]

        if (!url) {
            console.error(`Unknown social link platform: ${platform}`)
            return
        }

        link.href = url
        link.target = '_blank'
        link.rel = 'noopener noreferrer'
    })

    const structuredDataElement = document.getElementById('clinic-structured-data')
    if (structuredDataElement) {
        const structuredData = JSON.parse(structuredDataElement.textContent)
        structuredData.sameAs = Object.values(socialLinks)
        structuredDataElement.textContent = JSON.stringify(structuredData)
    }
})()
