Transform vis-controller.js to webComponent to use tag 'annotation-player-iiif' :

1. review vis-controller.js to update it as web component '.
2. update vis_timeline_demo.html to use the new web component.
3. need to support properties :
    - iiifAnnotationListUrl
    - mediaUrl 
    - mediaType (audio or video)
    - waveFormUrl   
    - subtitleFilesUrl (array of objects with url and language) //how to handle this ?
    - waveformStrokeColor
    - waveformStrokeWidth
    - annotationMinTimeToDisplay
    - annotationPropertiesToDisplay (times, text, author) List of properties in iiif annotation to display. One per line and in order where they are enumerate on the webComponent property.
    - canAddAnnotation
    - canEditAllAnnotation
    - canUpdateAnnotationForAuthorName
